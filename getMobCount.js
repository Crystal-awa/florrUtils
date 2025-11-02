// 本代码为获取所有mob的击杀数
// Made by 可爱猫娘 2038794363
// 获取BaseAddress
const Base = await (async () => {
    async function fetchWasmBytes() {
        const response = await fetch(`https://static.florr.io/${window.versionHash}/client.wasm`);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    function readVarUint32(arr) {
        let idx = 0, res = 0;
        do res |= (arr[idx] & 0b01111111) << idx * 7;
        while (arr[idx++] & 0b10000000);
        return [idx, res];
    }
    
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
            throw new Error('未找到 base address');
        } else {
            return addrs[0];
        }
    } catch (error) {
        console.error('获取 BaseAddress 失败:', error);
        throw error;
    }
})();

// 获取击杀数
async function getMobs(){
    const heap = window.Module?.HEAPU32;
    if (!heap) {
        console.error('HEAPU32 未初始化');
        return;
    }
    const florrioUtils = window.florrio?.utils;
    const petals = florrioUtils.getPetals();
    const petalSids = petals.map(p => p.sid);
    const rarityCountAll = petals.find(p => Array.isArray(p.allowedDropRarities))?.allowedDropRarities.length || 9;
    const end = Base + petalSids.length * rarityCountAll - 1;
    const endAddress = end * 4 + 164;

    const mobs = florrioUtils.getMobs();
    const base = endAddress / 4;
    const rarityNames = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super'];
    const rarityCount = rarityNames.length;
    const result = [];
    const maxId = Math.max(...mobs.map(mob => mob.id));

    for (let i = 0; i < maxId; i++) {
        for (let r = 0; r < rarityCount; r++) {
            const idx = base + i * rarityCount * 2 + r * 2;
            result.push(heap[idx])
        }
    }
    const grouped = [];
    const groupSize = rarityCount; // 8

    for (let i = 0; i < result.length; i += groupSize) {
        grouped.push(result.slice(i, i + groupSize));
    }
    return grouped
}

// 输出
async function main() {
    const grouped = await getMobs();
    console.log(grouped);
}

// 执行一次
main();