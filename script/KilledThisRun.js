// ==UserScript==
// @name         Florr.io - Killed This Run Tracker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Track mobs killed in current run with drag and resize support
// @author       You
// @match        https://florr.io/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 等待游戏加载
    function waitForGame() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (window.Module && window.Module.HEAPU32 && window.florrio && window.florrio.utils) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    // 格式化数字显示
    function formatCount(count) {
        if (count >= 1000000000) {
            return (count / 1000000000).toFixed(1) + 'b';
        } else if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'm';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'k';
        }
        return count.toString();
    }

    // 拖拽和缩放管理类
    class DraggableResizable {
        constructor(elementId, options = {}) {
            this.elementId = elementId;
            this.options = {
                enableDrag: options.enableDrag !== false,
                enableResize: options.enableResize !== false,
                baseWidth: options.baseWidth || 1920,
                baseHeight: options.baseHeight || 1080,
                customScale: options.customScale || 1.0,
                defaultX: options.defaultX || 0,
                defaultY: options.defaultY || 0,
                minScale: options.minScale || 0.6,
            };

            this.element = null;
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.currentX = this.options.defaultX;
            this.currentY = this.options.defaultY;
            this.scale = 1;
            this.previousWidth = window.innerWidth;
            this.previousHeight = window.innerHeight;

            this.handleMouseDown = this.handleMouseDown.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseUp = this.handleMouseUp.bind(this);
            this.handleResize = this.handleResize.bind(this);
        }

        init(element) {
            this.element = element;
            this.loadPosition();

            // 如果默认位置是 (0, 0)，居中显示
            if (this.currentX === 0 && this.currentY === 0) {
                this.currentX = window.innerWidth / 2;
                this.currentY = window.innerHeight / 2;
            }

            this.updatePosition();
            this.updateScale();

            if (this.options.enableDrag) {
                this.element.style.cursor = 'move';
                this.element.addEventListener('mousedown', this.handleMouseDown);
                document.addEventListener('mousemove', this.handleMouseMove);
                document.addEventListener('mouseup', this.handleMouseUp);
            }

            if (this.options.enableResize) {
                window.addEventListener('resize', this.handleResize);
            }
        }

        loadPosition() {
            const saved = localStorage.getItem('KilledTracker_Position');
            if (saved) {
                try {
                    const pos = JSON.parse(saved);
                    this.currentX = pos.x || this.currentX;
                    this.currentY = pos.y || this.currentY;
                } catch (e) {
                    console.error('Failed to load position:', e);
                }
            }
        }

        savePosition() {
            try {
                localStorage.setItem('KilledTracker_Position', JSON.stringify({
                    x: this.currentX,
                    y: this.currentY
                }));
            } catch (e) {
                console.error('Failed to save position:', e);
            }
        }

        updatePosition() {
            if (this.element) {
                this.element.style.left = `${this.currentX}px`;
                this.element.style.top = `${this.currentY}px`;
            }
        }

        updateScale() {
            const widthScale = window.innerWidth / this.options.baseWidth;
            const heightScale = window.innerHeight / this.options.baseHeight;
            const baseScale = Math.min(widthScale, heightScale);
            this.scale = Math.max(this.options.minScale, baseScale * this.options.customScale);

            if (this.element) {
                this.element.style.transform = `scale(${this.scale})`;
            }
        }

        handleMouseDown(e) {
            // 检查是否点击了可交互元素
            const target = e.target;
            const tagName = target.tagName.toLowerCase();
            const isInteractive = ['button', 'input', 'textarea', 'select', 'a'].includes(tagName);

            if (isInteractive) return;

            // 检查是否点击了滚动条区域
            const rect = this.element.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const scrollbarWidth = this.element.offsetWidth - this.element.clientWidth;
            const scrollbarHeight = this.element.offsetHeight - this.element.clientHeight;

            if (scrollbarWidth > 0 && clickX > this.element.clientWidth) return;
            if (scrollbarHeight > 0 && clickY > this.element.clientHeight) return;

            this.isDragging = true;
            this.startX = e.clientX - this.currentX;
            this.startY = e.clientY - this.currentY;
            this.element.style.cursor = 'grabbing';
            e.preventDefault();
        }

        handleMouseMove(e) {
            if (!this.isDragging) return;

            this.currentX = e.clientX - this.startX;
            this.currentY = e.clientY - this.startY;
            this.updatePosition();
        }

        handleMouseUp() {
            if (this.isDragging) {
                this.isDragging = false;
                this.element.style.cursor = 'move';
                this.savePosition();
            }
        }

        handleResize() {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;

            // 按比例调整位置
            const widthRatio = newWidth / this.previousWidth;
            const heightRatio = newHeight / this.previousHeight;

            this.currentX = this.currentX * widthRatio;
            this.currentY = this.currentY * heightRatio;

            this.previousWidth = newWidth;
            this.previousHeight = newHeight;

            this.updatePosition();
            this.updateScale();
            this.savePosition();
        }

        destroy() {
            if (this.element) {
                this.element.removeEventListener('mousedown', this.handleMouseDown);
            }
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
            window.removeEventListener('resize', this.handleResize);
        }
    }

    // Mob数据管理类
    class MobTracker {
        constructor() {
            this.initialData = null;
            this.currentData = null;
            this.mobRarityNames = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super'];
            this.mobSids = [];
            this.mobIdMap = {};
            this.mobById = {};
            this.maxMobId = 0;
            this.mobBase = 0;
            this.florrioUtils = null;
            this.mobImageCache = {};
            this.updateInterval = null;
            this.existingKeys = new Set(); // 追踪已存在的怪物
        }

        async initialize() {
            await waitForGame();
            
            this.florrioUtils = window.florrio.utils;
            const mobs = this.florrioUtils.getMobs();
            
            this.mobSids = mobs.map(m => m.sid);
            this.mobIdMap = Object.fromEntries(mobs.map(m => [m.sid, m.id]));
            mobs.forEach(mob => {
                this.mobById[mob.id] = mob;
            });
            this.maxMobId = Math.max(...mobs.map(mob => mob.id));
            
            // 计算mob数据在内存中的基址
            const inventoryBaseAddress = await this.getInventoryBaseAddress();
            const petals = this.florrioUtils.getPetals();
            const petalSids = petals.map(p => p.sid);
            const rarityCount = petals.find(p => Array.isArray(p.allowedDropRarities))?.allowedDropRarities.length || 9;
            const end = inventoryBaseAddress + petalSids.length * rarityCount - 1;
            const endAddress = end * 4 + 164;
            this.mobBase = endAddress / 4;
            
            // 初始化基准数据
            this.resetBaseline();
            
            // 开始定时更新
            this.startTracking();
        }

        async getInventoryBaseAddress() {
            const response = await fetch(`https://static.florr.io/${window.versionHash}/client.wasm`);
            const buffer = await response.arrayBuffer();
            const arr = new Uint8Array(buffer);
            
            const readVarUint32 = (arr) => {
                let idx = 0, res = 0;
                do res |= ((arr[idx] ?? 0) & 0b01111111) << idx * 7;
                while ((arr[idx++] ?? 0) & 0b10000000);
                return [idx, res];
            };
            
            const addrs = [];
            for (let i = 0; i < arr.length; i++) {
                let j = i;
                if (arr[j++] !== 0x41) continue;
                if (arr[j++] !== 1) continue;
                if (arr[j++] !== 0x3a) continue;
                if (arr[j++] !== 0) continue;
                if (arr[j++] !== 0) continue;
                if (arr[j++] !== 0x41) continue;
                const result = readVarUint32(arr.subarray(j));
                const [offset, addr] = result;
                j += offset;
                if (arr[j++] !== 0x41) continue;
                if (arr[j++] !== 5) continue;
                if (arr[j++] !== 0x36) continue;
                if (arr[j++] !== 2) continue;
                if (arr[j++] !== 0) continue;
                addrs.push(addr >> 2);
            }
            
            return addrs[0];
        }

        getMobData() {
            const moduleHeap = window.Module?.HEAPU32;
            if (!moduleHeap) return null;

            const data = [];
            
            for (let i = 0; i <= this.maxMobId; i++) {
                const mobCounts = [];
                
                for (let r = 0; r < this.mobRarityNames.length; r++) {
                    const idx = this.mobBase + i * this.mobRarityNames.length * 2 + r * 2;
                    const count = moduleHeap[idx] || 0;
                    mobCounts.push(count);
                }
                
                const actualMobId = i + 1;
                const mob = this.mobById[actualMobId];
                
                if (mob) {
                    data.push({
                        id: mob.id,
                        sid: mob.sid,
                        counts: mobCounts
                    });
                }
            }
            
            return data;
        }

        resetBaseline() {
            this.initialData = JSON.parse(JSON.stringify(this.getMobData()));
        }

        getKilledThisRun() {
            this.currentData = this.getMobData();
            if (!this.currentData || !this.initialData) return [];

            const killed = [];
            
            this.currentData.forEach((current, index) => {
                const initial = this.initialData[index];
                if (!initial) return;
                
                current.counts.forEach((count, rarityIndex) => {
                    const diff = count - (initial.counts[rarityIndex] || 0);
                    if (diff > 0) {
                        const rarity = this.mobRarityNames[rarityIndex];
                        if (!rarity) return;
                        
                        const imageUrl = this.getMobImageUrl(rarity, current.sid);
                        if (!imageUrl) return;
                        
                        killed.push({
                            sid: current.sid,
                            rarity: rarity,
                            imageUrl: imageUrl,
                            count: diff,
                            rarityIndex: rarityIndex
                        });
                    }
                });
            });
            
            return killed;
        }

        getMobImageUrl(rarityName, sid) {
            const mobId = this.mobIdMap[sid];
            if (mobId == null) return null;

            const rarityIndex = this.mobRarityNames.indexOf(rarityName);
            if (rarityIndex === -1) return null;

            const key = `${rarityName}_${sid}`;
            if (this.mobImageCache[key]) return this.mobImageCache[key];
            if (!this.florrioUtils) return null;
            
            const url = this.florrioUtils.generateMobImage(64, mobId, (rarityIndex - 1).toString(), 1);
            this.mobImageCache[key] = url;
            return url;
        }

        startTracking() {
            this.updateInterval = setInterval(() => {
                const killed = this.getKilledThisRun();
                this.updateUI(killed);
            }, 50);
        }

        updateUI(killed) {
            const container = document.getElementById('killed-tracker-container');
            if (!container) return;

            const contentBody = container.querySelector('.killed-content-body');
            if (!contentBody) return;

            // 按稀有度排序
            const rarityOrder = ['Super', 'Ultra', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Unusual', 'Common'];
            const sortedKilled = killed.sort((a, b) => {
                const rarityDiff = rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
                if (rarityDiff !== 0) return rarityDiff;
                return a.sid.localeCompare(b.sid);
            });

            // 合并相同的怪物
            const mobMap = new Map();
            sortedKilled.forEach(item => {
                const key = `${item.rarity}_${item.sid}`;
                if (mobMap.has(key)) {
                    mobMap.get(key).count += item.count;
                } else {
                    mobMap.set(key, {...item});
                }
            });

            // 获取当前所有的 key
            const currentKeys = Array.from(mobMap.keys());
            
            // 找出需要移除的元素
            const existingElements = contentBody.querySelectorAll('.killed-mob-item');
            existingElements.forEach(element => {
                const key = element.getAttribute('data-key');
                if (!currentKeys.includes(key)) {
                    element.remove();
                }
            });

            // 更新或添加元素
            mobMap.forEach(mob => {
                const key = `${mob.rarity}_${mob.sid}`;
                let mobDiv = contentBody.querySelector(`[data-key="${key}"]`);
                
                // 如果元素不存在，创建新元素
                if (!mobDiv) {
                    mobDiv = document.createElement('div');
                    mobDiv.className = 'killed-mob-item is-new'; // 新元素添加动画类
                    mobDiv.setAttribute('data-key', key);
                    
                    const img = document.createElement('img');
                    img.src = mob.imageUrl;
                    img.alt = mob.sid;
                    img.className = 'killed-mob-image';
                    mobDiv.appendChild(img);
                    
                    // 按稀有度顺序插入
                    let inserted = false;
                    const existingItems = contentBody.querySelectorAll('.killed-mob-item');
                    for (let i = 0; i < existingItems.length; i++) {
                        const existingKey = existingItems[i].getAttribute('data-key');
                        const existingIndex = currentKeys.indexOf(existingKey);
                        const newIndex = currentKeys.indexOf(key);
                        if (newIndex < existingIndex) {
                            contentBody.insertBefore(mobDiv, existingItems[i]);
                            inserted = true;
                            break;
                        }
                    }
                    if (!inserted) {
                        contentBody.appendChild(mobDiv);
                    }
                    
                    // 200ms 后移除动画类，避免重复播放
                    setTimeout(() => {
                        mobDiv.classList.remove('is-new');
                    }, 200);
                }
                
                // 更新或添加数量徽章
                let badge = mobDiv.querySelector('.killed-count-badge');
                if (mob.count > 1) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'killed-count-badge';
                        mobDiv.appendChild(badge);
                    }
                    badge.textContent = `x${formatCount(mob.count)}`;
                } else {
                    if (badge) {
                        badge.remove();
                    }
                }
            });
        }

        stop() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }
    }

    // 创建UI
    function createUI() {
        const container = document.createElement('div');
        container.id = 'killed-tracker-container';
        container.innerHTML = `
            <div class="killed-tracker-panel">
                <div class="killed-tracker-title">Killed this run</div>
                <div class="killed-content-body"></div>
            </div>
        `;
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            #killed-tracker-container {
                position: fixed;
                z-index: 10000;
                transform-origin: top left;
                user-select: none;
            }
            
            .killed-tracker-panel {
                width: 200px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 3px;
                padding-bottom: 10px;
            }
            
            .killed-tracker-title {
                display: block;
                text-align: center;
                padding: 15px 10px 10px;
                color: white;
                text-shadow:
                    -0.5px -0.5px 0 #000,
                    0.5px -0.5px 0 #000,
                    -0.5px 0.5px 0 #000,
                    0.5px 0.5px 0 #000,
                    0 0.5px 0 #000,
                    0 -0.5px 0 #000,
                    -0.5px 0 0 #000,
                    0.5px 0 0 #000;
                font-size: 14px;
            }
            
            .killed-content-body {
                width: 177px;
                margin: 0 auto;
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                max-height: 160px;
                overflow-y: auto;
                overflow-x: hidden;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,0.3) rgba(255,255,255,0.1);
            }
            
            .killed-content-body::-webkit-scrollbar {
                width: 6px;
            }
            
            .killed-content-body::-webkit-scrollbar-track {
                background: rgba(255,255,255,0.1);
            }
            
            .killed-content-body::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.3);
                border-radius: 3px;
            }
            
            .killed-mob-item {
                position: relative;
                display: flex;
            }
            
            .killed-mob-item.is-new {
                animation: fadeIn 0.2s ease forwards;
            }
            
            @keyframes fadeIn {
                0% {
                    transform: scale(0);
                    opacity: 0;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            
            .killed-mob-image {
                width: 38px;
                height: 38px;
                padding: 1px;
                pointer-events: none;
            }
            
            .killed-count-badge {
                position: absolute;
                top: 0;
                right: 0;
                transform: rotate(25deg);
                color: white;
                text-align: center;
                text-shadow:
                    -0.5px -0.5px 0 #000,
                    0.5px -0.5px 0 #000,
                    -0.5px 0.5px 0 #000,
                    0.5px 0.5px 0 #000,
                    0 0.5px 0 #000,
                    0 -0.5px 0 #000,
                    -0.5px 0 0 #000,
                    0.5px 0 0 #000;
                font-size: 10px;
                font-weight: bold;
                padding: 1px 3px;
                border-radius: 2px;
                min-width: 12px;
                pointer-events: none;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(container);
        
        return container;
    }

    // 主函数
    async function main() {
        // 等待页面加载
        await new Promise(resolve => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });

        // 创建UI
        const container = createUI();
        
        // 初始化拖拽和缩放
        const draggable = new DraggableResizable('killed-tracker', {
            enableDrag: true,
            enableResize: true,
            baseWidth: 1920,
            baseHeight: 1080,
            customScale: 1.0,
            minScale: 0.6,
            defaultX: 0,
            defaultY: 0
        });
        draggable.init(container);
        
        // 初始化追踪器
        const tracker = new MobTracker();
        await tracker.initialize();

        console.log('Florr.io Killed This Run Tracker loaded successfully!');
        
        // 清理函数
        window.addEventListener('beforeunload', () => {
            draggable.destroy();
            tracker.stop();
        });
    }

    // 启动脚本
    main().catch(console.error);
})();