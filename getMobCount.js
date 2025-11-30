// Florr.io Mob 击杀数统计工具
// Original by 可爱猫娘 2038794363

function main() {
    'use strict';

    function readVarUint32(arr) {
        let idx = 0, res = 0;
        do res |= (arr[idx] & 0b01111111) << idx * 7;
        while (arr[idx++] & 0b10000000);
        return [idx, res];
    }

    async function fetchWasmBytes() {
        const response = await fetch(`https://static.florr.io/${window.versionHash}/client.wasm`);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function getInventoryBaseAddress() {
        try {
            const arr = await fetchWasmBytes();
            const addrs = [];
            
            for (let i = 0; i < arr.length; i++) {
                let j = i;
                if (arr[j++] !== 0x41) continue; // i32.const
                if (arr[j++] !== 1) continue;    // 1
                if (arr[j++] !== 0x3a) continue; // i32.store8
                if (arr[j++] !== 0) continue;    // align=0
                if (arr[j++] !== 0) continue;    // offset=0
                if (arr[j++] !== 0x41) continue; // i32.const
                const [offset, addr] = readVarUint32(arr.subarray(j));
                j += offset;
                if (arr[j++] !== 0x41) continue; // i32.const
                if (arr[j++] !== 5) continue;    // 5
                if (arr[j++] !== 0x36) continue; // i32.store
                if (arr[j++] !== 2) continue;    // align=2
                if (arr[j++] !== 0) continue;    // offset=0
                addrs.push(addr >> 2);
            }
            
            if (addrs.length === 1) {
                return addrs[0];
            } else if (addrs.length === 0) {
                throw new Error('未找到 Inventory base address');
            } else {
                console.warn('找到多个地址，使用第一个:', addrs);
                return addrs[0];
            }
        } catch (error) {
            console.error('获取 base address 失败:', error);
            throw error;
        }
    }

    (async () => {
        while (!window.versionHash) {
            await new Promise(r => setTimeout(r, 100));
        }

        const inventoryBaseAddress = await getInventoryBaseAddress();
        // console.log('base address:', inventoryBaseAddress);

        let florrioUtils;
        while (!(florrioUtils = window?.florrio?.utils)) {
            await new Promise(r => setTimeout(r, 100));
        }

        const petals = florrioUtils.getPetals();
        const petalSids = petals.map(p => p.sid);
        const rarityCountAll = petals.find(p => Array.isArray(p.allowedDropRarities))?.allowedDropRarities.length || 9;
        
        const mobs = florrioUtils.getMobs();
        const mobSids = mobs.map(m => m.sid);
        
        const mobById = {};
        mobs.forEach(mob => {
            mobById[mob.id] = mob;
        });
        
        const maxMobId = Math.max(...mobs.map(mob => mob.id));
        const MobIdMap = Object.fromEntries(mobs.map(p => [p.sid, p.id]));

        const rarityNames = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super'];
        const rarityCount = rarityNames.length; // 8
        const rarityIndexMap = Object.fromEntries(rarityNames.map((name, index) => [name, index]));

        const end = inventoryBaseAddress + petalSids.length * rarityCountAll - 1;
        const endAddress = end * 4 + 176;
        const mobBase = endAddress / 4;

        const imageCache = {};

        window.MobCountLogger = {
            summary: null,
            detail: null,
            raw: null,
            lastUpdate: null,
            
            getSummary() { 
                return this.summary; 
            },
            
            getDetail() { 
                return this.detail; 
            },
            
            getRaw() {
                return this.raw;
            },
            
            getRawFormatted() {
                if (!this.raw) return null;
                return this.raw.map(item => ({
                    id: item.id,
                    sid: item.sid,
                    kills: rarityNames.reduce((obj, name, idx) => {
                        obj[name] = item.counts[idx];
                        return obj;
                    }, {})
                }));
            },
            
            getLastUpdate() { 
                return this.lastUpdate; 
            },
            
            getImageUrl(rarityName, sid) {
                const rarityIdx = rarityIndexMap[rarityName];
                const MobId = MobIdMap[sid];
                if (rarityIdx == null || MobId == null) return null;
                const key = `${rarityName}_${sid}`;
                if (imageCache[key]) return imageCache[key];
                const url = florrioUtils.generateMobImage(64, MobId, rarityIdx, 1);
                imageCache[key] = url;
                return url;
            },
            
            getTotalKills(sid) {
                if (!this.detail) return 0;
                let total = 0;
                rarityNames.forEach(rarity => {
                    total += this.detail[rarity][sid] || 0;
                });
                return total;
            },
            
            getGrandTotal() {
                if (!this.summary) return 0;
                return Object.values(this.summary).reduce((sum, count) => sum + count, 0);
            },
            
            getLeaderboard() {
                if (!this.detail) return [];
                const leaderboard = [];
                mobSids.forEach(sid => {
                    const total = this.getTotalKills(sid);
                    if (total > 0) {
                        leaderboard.push({ sid, name: sid, total });
                    }
                });
                return leaderboard.sort((a, b) => b.total - a.total);
            }
        };

        const updateData = () => {
            const moduleHeap = window.Module?.HEAPU32 || (typeof Module !== 'undefined' && Module.HEAPU32);
            if (!moduleHeap) return;

            const summary = {};
            const detail = {};
            const raw = [];

            rarityNames.forEach(r => {
                summary[r] = 0;
                detail[r] = {};
                mobSids.forEach(sid => detail[r][sid] = 0);
            });

            for (let i = 0; i <= maxMobId; i++) {
                const mobData = [];
                
                for (let r = 0; r < rarityCount; r++) {
                    const idx = mobBase + i * rarityCount * 2 + r * 2;
                    const count = moduleHeap[idx] || 0;
                    mobData.push(count);
                }
                
                const actualMobId = i + 1;
                const mob = mobById[actualMobId];
                
                if (mob) {
                    raw.push({
                        id: mob.id,
                        sid: mob.sid,
                        counts: mobData
                    });
                    
                    // 统计数据
                    for (let r = 0; r < rarityCount; r++) {
                        summary[rarityNames[r]] += mobData[r];
                        detail[rarityNames[r]][mob.sid] = mobData[r];
                    }
                }
            }

            window.MobCountLogger.summary = summary;
            window.MobCountLogger.detail = detail;
            window.MobCountLogger.raw = raw;
            window.MobCountLogger.lastUpdate = Date.now();
        };
        
        updateData();
        setInterval(updateData, 5000);
    })();
}

main();

/*
获取按稀有度分类的总击杀数
MobCountLogger.getSummary()

获取每个 mob 的详细击杀数
MobCountLogger.getDetail()

获取某个 mob 的总击杀数（所有稀有度）
MobCountLogger.getTotalKills('ladybug')

获取所有 mob 的总击杀数
MobCountLogger.getGrandTotal()

获取击杀排行榜(按总击杀数排序_
MobCountLogger.getLeaderboard()

获取 mob 图片
MobCountLogger.getImageUrl("Rare","ladybug")

获取原始数据(类似官方的getMobs())
MobCountLogger.getRaw()

获取格式化的原始数据(更易读)
MobCountLogger.getRawFormatted()

获取最后更新时间
MobCountLogger.getLastUpdate()
*/