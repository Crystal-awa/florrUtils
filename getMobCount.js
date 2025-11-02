async function getMobs(){
    const heap = window.Module?.HEAP32;
    let florrioUtils;
    while (!(florrioUtils = window.florrio?.utils)) {
        await new Promise(r => setTimeout(r, 100));
    }
    const mobs = florrioUtils.getMobs();
    const base = 0x1240498 / 4;
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

async function main() {
    const grouped = await getMobs();
    console.log(grouped);
}

main();
