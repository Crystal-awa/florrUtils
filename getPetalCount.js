// Florr.io Petal 数量统计工具
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
                throw new Error('Inventory base address not found');
            } else {
                console.warn('Multiple addresses found, using first:', addrs);
                return addrs[0];
            }
        } catch (error) {
            console.error('Failed to get inventory base address:', error);
            throw error;
        }
    }

    (async () => {
        while (!window.versionHash) {
            await new Promise(r => setTimeout(r, 100));
        }

        const inventoryBaseAddress = await getInventoryBaseAddress();
        // console.log('Inventory base address 已获取:', inventoryBaseAddress);

        let florrioUtils;
        while (!(florrioUtils = window?.florrio?.utils)) {
            await new Promise(r => setTimeout(r, 100));
        }

        const petals = florrioUtils.getPetals();
        const petalSids = petals.map(p => p.sid);
        const petalIdMap = Object.fromEntries(petals.map(p => [p.sid, p.id]));

        let rarityCount = 9;
        const sample = petals.find(p => Array.isArray(p.allowedDropRarities));
        if (sample) rarityCount = sample.allowedDropRarities.length;
        const kRarityNames = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super', 'Unique']
            .slice(0, rarityCount);
        const rarityIndexMap = Object.fromEntries(kRarityNames.map((name, index) => [name, index]));

        const imageCache = {};

        window.PetalCountLogger = {
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
            
            getLastUpdate() { 
                return this.lastUpdate; 
            },
            
            getRawFormatted() {
                if (!this.raw) return null;
                return this.raw.map(item => ({
                    id: item.id,
                    sid: item.sid,
                    counts: kRarityNames.reduce((obj, name, idx) => {
                        obj[name] = item.counts[idx];
                        return obj;
                    }, {})
                }));
            },
            
            getImageUrl(rarityName, sid) {
                const rarityIdx = rarityIndexMap[rarityName];
                const petalId = petalIdMap[sid];
                if (rarityIdx == null || petalId == null) return null;
                const key = `${rarityName}_${sid}`;
                if (imageCache[key]) return imageCache[key];
                const url = florrioUtils.generatePetalImage(64, petalId, rarityIdx, 1);
                imageCache[key] = url;
                return url;
            },
            
            getTotalCount(sid) {
                if (!this.detail) return 0;
                let total = 0;
                kRarityNames.forEach(rarity => {
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
                petalSids.forEach(sid => {
                    const total = this.getTotalCount(sid);
                    if (total > 0) {
                        leaderboard.push({ 
                            sid, 
                            name: sid, 
                            total,
                            id: petalIdMap[sid]
                        });
                    }
                });
                return leaderboard.sort((a, b) => b.total - a.total);
            },
            
            getLeaderboardByRarity(rarityName) {
                if (!this.detail || !this.detail[rarityName]) return [];
                const leaderboard = [];
                petalSids.forEach(sid => {
                    const count = this.detail[rarityName][sid] || 0;
                    if (count > 0) {
                        leaderboard.push({ 
                            sid, 
                            name: sid, 
                            count,
                            id: petalIdMap[sid]
                        });
                    }
                });
                return leaderboard.sort((a, b) => b.count - a.count);
            },
            
            getDistribution(sid) {
                if (!this.detail) return null;
                const distribution = {};
                kRarityNames.forEach(rarity => {
                    distribution[rarity] = this.detail[rarity][sid] || 0;
                });
                return distribution;
            },
            
            getRarityPercentage() {
                if (!this.summary) return null;
                const total = this.getGrandTotal();
                if (total === 0) return null;
                
                const percentage = {};
                kRarityNames.forEach(rarity => {
                    const count = this.summary[rarity] || 0;
                    percentage[rarity] = {
                        count: count,
                        percentage: ((count / total) * 100).toFixed(2) + '%'
                    };
                });
                return percentage;
            }
        };

        const updateInterval = setInterval(() => {
            const moduleHeap = window.Module?.HEAPU32 || (typeof Module !== 'undefined' && Module.HEAPU32);
            if (!moduleHeap) return;

            const summary = {};
            const detail = {};
            const raw = [];
            
            kRarityNames.forEach(r => {
                summary[r] = 0;
                detail[r] = {};
                petalSids.forEach(sid => detail[r][sid] = 0);
            });

            for (let p = 0; p < petalSids.length; p++) {
                const petalData = [];
                
                for (let r = 0; r < rarityCount; r++) {
                    const idx = inventoryBaseAddress + p * rarityCount + r;
                    const count = moduleHeap[idx] || 0;
                    petalData.push(count);
                    summary[kRarityNames[r]] += count;
                    detail[kRarityNames[r]][petalSids[p]] = count;
                }
                
                raw.push({
                    id: petalIdMap[petalSids[p]],
                    sid: petalSids[p],
                    counts: petalData
                });
            }

            window.PetalCountLogger.summary = summary;
            window.PetalCountLogger.detail = detail;
            window.PetalCountLogger.raw = raw;
            window.PetalCountLogger.lastUpdate = Date.now();
        }, 5000);
        updateInterval();
    })();
}
main();

/*
获取按稀有度分类的总数量
PetalCountLogger.getSummary()

获取每个花瓣的详细数量
PetalCountLogger.getDetail()

获取某个花瓣的总数量（所有稀有度）
PetalCountLogger.getTotalCount('rose')

获取数量排行榜（所有稀有度）
PetalCountLogger.getLeaderboard()

获取指定稀有度的排行榜
PetalCountLogger.getLeaderboardByRarity('Legendary')

获取某个花瓣的稀有度分布
PetalCountLogger.getDistribution('rose')

获取稀有度百分比分布
PetalCountLogger.getRarityPercentage()

获取所有花瓣的总数量
PetalCountLogger.getGrandTotal()

获取原始数据
PetalCountLogger.getRaw()

获取格式化的原始数据
PetalCountLogger.getRawFormatted()

获取某个花瓣的图片
PetalCountLogger.getImageUrl('Rare', 'air')

获取最后更新时间
new Date(PetalCountLogger.getLastUpdate())
*/