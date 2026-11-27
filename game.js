// game.js - Bộ điều khiển logic game 5AM (Phiên bản Stardew Valley: Bản đồ mở rộng 2000x1400 + Vòng lặp Ngày/Đêm, Đi chợ, Bán cà phê, Ngủ tổng kết ngày)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Tự động tăng cỡ chữ & độ đậm nhẹ cho font nhỏ khi hiển thị trên màn hình điện thoại
let mobileFontBoostPx = 0;
(function installMobileFontBooster() {
    try {
        const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
        if (!desc || !desc.set || !desc.get) return;
        Object.defineProperty(ctx, 'font', {
            configurable: true,
            get() {
                return desc.get.call(this);
            },
            set(val) {
                if (mobileFontBoostPx > 0 && typeof val === 'string') {
                    const boosted = val.replace(/(^|\s)(\d+(?:\.\d+)?)px(?=\s)/, (m, pre, numStr) => {
                        const sz = parseFloat(numStr);
                        if (!Number.isFinite(sz) || sz >= 17) return m;
                        const add = sz <= 12.5 ? mobileFontBoostPx : mobileFontBoostPx * 0.72;
                        const nextSz = Math.min(17.5, Math.round((sz + add) * 2) / 2);
                        return `${pre}${nextSz}px`;
                    });
                    const finalFont = (!/\b(bold|600|700|800|900)\b/i.test(boosted) && /\b(1[0-5](?:\.\d+)?)px\b/.test(boosted))
                        ? `600 ${boosted}`
                        : boosted;
                    return desc.set.call(this, finalFont);
                }
                return desc.set.call(this, val);
            }
        });
    } catch (_) {}
})();

const nameInput = document.getElementById('playerNameInput');
const birthdayField = document.getElementById('playerBirthdayField');
const birthdayInput = document.getElementById('playerBirthdayInput');
const playerFormFields = document.getElementById('playerFormFields');
const PAL = GAME_CONFIG.PALETTE;
const GAME_STATES = GAME_CONFIG.STATES;

let currentGameState = GAME_STATES.WELCOME;
// Năm 2: lộ trình xe khách và hàng đặc sản của người chơi.
const yearTwo = {
    introSeen: false,
    showTrailer: false,
    backpack: false,
    travel: null,
    province: null,
    destination: 'DALAT',
    stocks: { flowers: 0, strawberries: 0, arabica: 0, coconut: 0, seafood: 0, silk: 0, oysters: 0, seaSalt: 0 },
    bag: { flowers: 0, strawberries: 0, arabica: 0, coconut: 0, seafood: 0, silk: 0, oysters: 0, seaSalt: 0 }
};
const busRoutes = [
    { id: 'DALAT', name: 'Đà Lạt', zone: 'DALAT_NIGHT' },
    { id: 'MEKONG', name: 'Miền Tây', zone: 'MEKONG_QUAY' },
    { id: 'VUNGTAU', name: 'Vũng Tàu', zone: 'VUNGTAU_BAI_SAU' }
];
const busTerminal = { zone: 'BREEZE_AREA', arrivalX: 470, arrivalY: 425 };
const terminalBuses = [
    { x: 110, y: 240, w: 154, h: 50 },
    { x: 350, y: 240, w: 154, h: 50 },
    { x: 590, y: 240, w: 154, h: 50 },
    { x: 110, y: 350, w: 154, h: 50 },
    { x: 350, y: 350, w: 154, h: 50 },
    { x: 590, y: 350, w: 154, h: 50 }
];
let showBusRoutes = false;
let busScene = null;

let showSettingsModal = false;
let showHandbookModal = false;
let handbookTab = 'guide';
let needsFirstSaveSlotChoice = false;
let masterVolume = 0.7;
let settingAudioContext = null;
try {
    const savedVolumeText = localStorage.getItem('5am.masterVolume');
    const savedVolume = savedVolumeText === null ? NaN : Number(savedVolumeText);
    if (Number.isFinite(savedVolume)) masterVolume = Math.max(0, Math.min(1, savedVolume));
} catch (_) {}
if (window.GameAudio) GameAudio.setVolume(masterVolume);

function setMasterVolume(value) {
    masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
    introVideo.volume = masterVolume;
    introVideo.muted = masterVolume === 0;
    if (window.GameAudio) GameAudio.setVolume(masterVolume);
    try { localStorage.setItem('5am.masterVolume', String(masterVolume)); } catch (_) {}
}

function previewSettingSound() {
    if (window.GameAudio) {
        GameAudio.unlock();
        GameAudio.setVolume(masterVolume);
        GameAudio.playCoin();
        return;
    }
    if (masterVolume <= 0) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        settingAudioContext ||= new AudioContextClass();
        if (settingAudioContext.state === 'suspended') settingAudioContext.resume();
        const now = settingAudioContext.currentTime;
        const oscillator = settingAudioContext.createOscillator();
        const gain = settingAudioContext.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(740, now);
        oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.11);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045 * masterVolume, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        oscillator.connect(gain);
        gain.connect(settingAudioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.17);
    } catch (_) {}
}

let playerConfig = {
    name: "Chủ Quán",
    birthday: 1,
    genderIndex: 0,
    genders: ["Nam", "Nữ"],
    outfitIndex: 0,
    outfits: [
        { name: "Áo thun cơ bản", color: "#3b78b8", shadow: "#285585", shorts: "#333942" },
        { name: "Áo sơ mi hẻm", color: "#c84b31", shadow: "#963420", shorts: "#3d352e" },
        { name: "Áo khoác chill", color: "#e5a93c", shadow: "#b88225", shorts: "#2e3830" }
    ],
    accessoryIndex: 0,
    accessories: [
        { name: "Không phụ kiện", type: "none" },
        { name: "Nón kết", type: "cap" },
        { name: "Nón tai bèo", type: "hat" }
    ]
};

const introVideo = document.createElement('video');
introVideo.src = 'intro.mp4';
introVideo.preload = 'auto';
introVideo.muted = masterVolume === 0;
introVideo.volume = masterVolume;
introVideo.playsInline = true;
let introPlaybackFailed = false;
introVideo.addEventListener('ended', finishIntro);
introVideo.addEventListener('error', () => { introPlaybackFailed = true; });

function finishIntro() {
    if (currentGameState !== GAME_STATES.INTRO) return;
    introVideo.pause();
    currentGameState = GAME_STATES.PLAYING_HOME;
    ensureChapterProgress(true);
    player.x = 500;
    player.y = 325;
}
let tickCount = 0;
let lastFrameTime = performance.now();
let dt = 1.0;

const WORLD_W = GAME_CONFIG.WORLD_WIDTH || 2000;
const WORLD_H = GAME_CONFIG.WORLD_HEIGHT || 1400;

let camera = {
    x: 450,
    y: 120
};

// Trạng thái kinh tế, thời gian, kho nguyên liệu & thống kê trong ngày
let playerStats = {
    money: 20000000, // 20 Triệu VND vốn khởi nghiệp
    energy: 100,     // Thể lực tối đa 100
    maxEnergy: 100,
    day: 1,          // Tổng số ngày đã chơi
    year: 1,         // Năm thứ 1
    dayOfYear: 1,    // Ngày trong năm (1 - 100)
    weather: 'SUNNY',
    tomorrowWeather: 'HOT',
    hour: GAME_CONFIG.TIME.WAKE_UP_HOUR, // 05:00 sáng
    timeSpeedMultiplier: 1,              // 1x (9.5 phút/ngày) hoặc 2x (4.75 phút/ngày)
    sleptLateYesterday: false
};

function rollSaigonWeather(dayOfYear) {
    const r = Math.random();
    // Nửa cuối năm 100 ngày mưa bão nhỉnh hơn một chút
    const isRainyHalf = dayOfYear > 50;
    if (isRainyHalf) {
        if (r < 0.36) return 'SUNNY';
        if (r < 0.54) return 'HOT';
        if (r < 0.86) return 'RAIN';
        return 'STORM';
    }
    if (r < 0.46) return 'SUNNY';
    if (r < 0.74) return 'HOT';
    if (r < 0.94) return 'RAIN';
    return 'STORM';
}

function getWeatherInfo(weatherId = playerStats.weather) {
    return GAME_CONFIG.WEATHER[weatherId] || GAME_CONFIG.WEATHER.SUNNY;
}

// Kho nguyên liệu khởi đầu tặng sẵn vài phần để người chơi thử pha chế ngay
const INGREDIENT_SHELF_LIFE = {
    coffee: 3, // Hạt cà phê rang: để tối đa 3 ngày
    milk: 2,   // Sữa đặc đã khui: để tối đa 2 ngày
    fruit: 1   // Trái cây & cam sả tươi: hư nếu để qua ngày hôm sau
};
const FRIDGE_UPGRADES = [
    { level: 0, name: 'Tủ Lạnh Cũ', bonusDays: 0, price: 0, desc: 'Bảo quản nguyên liệu theo hạn cơ bản.' },
    { level: 1, name: 'Tủ Lạnh Mini Inverter', bonusDays: 1, price: 2500000, desc: 'Tất cả nguyên liệu giữ tươi thêm +1 ngày.' },
    { level: 2, name: 'Tủ Mát Công Nghiệp 5AM', bonusDays: 2, price: 6500000, desc: 'Tất cả nguyên liệu giữ tươi thêm +2 ngày.' }
];
let fridgeLevel = 0;

function getIngredientShelfLife(ingId) {
    return (INGREDIENT_SHELF_LIFE[ingId] || 1) + (FRIDGE_UPGRADES[fridgeLevel]?.bonusDays || 0);
}

let inventory = {
    coffee: 6,
    milk: 4,
    fruit: 2
};
let inventoryBatches = {
    coffee: [{ qty: 6, daysLeft: INGREDIENT_SHELF_LIFE.coffee }],
    milk: [{ qty: 4, daysLeft: INGREDIENT_SHELF_LIFE.milk }],
    fruit: [{ qty: 2, daysLeft: INGREDIENT_SHELF_LIFE.fruit }]
};

function syncInventoryTotals() {
    for (const k of ['coffee', 'milk', 'fruit']) {
        const list = inventoryBatches[k] || [];
        inventory[k] = list.reduce((sum, b) => sum + Math.max(0, b.qty || 0), 0);
    }
}

function addInventory(ingId, amount) {
    if (!(ingId in INGREDIENT_SHELF_LIFE) || amount <= 0) return;
    const daysLeft = getIngredientShelfLife(ingId);
    const list = (inventoryBatches[ingId] ??= []);
    const existing = list.find((b) => b.daysLeft === daysLeft);
    if (existing) existing.qty += amount;
    else list.push({ qty: amount, daysLeft });
    syncInventoryTotals();
}

function consumeInventory(ingId, amount) {
    if (!(ingId in INGREDIENT_SHELF_LIFE) || amount <= 0) return;
    const list = (inventoryBatches[ingId] ??= []);
    list.sort((a, b) => a.daysLeft - b.daysLeft);
    let rem = amount;
    for (const batch of list) {
        if (rem <= 0) break;
        const take = Math.min(batch.qty, rem);
        batch.qty -= take;
        rem -= take;
    }
    inventoryBatches[ingId] = list.filter((b) => b.qty > 0);
    syncInventoryTotals();
}

function processDailyIngredientSpoilage() {
    const spoiled = { coffee: 0, milk: 0, fruit: 0 };
    for (const k of ['coffee', 'milk', 'fruit']) {
        const kept = [];
        for (const batch of (inventoryBatches[k] || [])) {
            const nextDays = (batch.daysLeft || 1) - 1;
            if (nextDays <= 0) spoiled[k] += batch.qty;
            else kept.push({ qty: batch.qty, daysLeft: nextDays });
        }
        inventoryBatches[k] = kept;
    }
    syncInventoryTotals();
    return spoiled;
}

const DAILY_EVENTS = [
    { id: 'market_sale', icon: '🏷️', title: 'Chợ Cô Ba xả kho', desc: 'Nguyên liệu chợ giảm thêm 25% hôm nay!', marketMult: 0.75 },
    { id: 'fruit_shortage', icon: '🍊', title: 'Cam sành khan hàng', desc: 'Giá Trái cây tại chợ tăng 35% hôm nay.', fruitMult: 1.35 },
    { id: 'office_rush', icon: '💼', title: 'Cao điểm văn phòng', desc: 'Khu Văn Phòng & Trung Tâm giá bán x1.25!', zoneIds: ['OFFICE_DISTRICT', 'DOWNTOWN'], priceMult: 1.25 },
    { id: 'tourist_wave', icon: '📸', title: 'Đoàn khách du lịch', desc: 'Quận 1 & Công Viên đông khách + giá x1.25!', zoneIds: ['DISTRICT_1', 'PARK'], priceMult: 1.25, spawnMult: 0.75 },
    { id: 'coffee_boom', icon: '☕', title: 'Trend Cà Phê Sài Gòn', desc: 'Khách khắp phố gọi món nhanh hơn 25%!', spawnMult: 0.75 }
];
let dailyEvent = null;

function rollDailyEvent() {
    if (Math.random() < 0.4) return null;
    return DAILY_EVENTS[Math.floor(Math.random() * DAILY_EVENTS.length)];
}

function getDailyEventPriceMult(zoneId = currentZone) {
    if (!dailyEvent?.priceMult) return 1;
    if (!dailyEvent.zoneIds || dailyEvent.zoneIds.includes(zoneId)) return dailyEvent.priceMult;
    return 1;
}

function getDailyEventSpawnMult(zoneId = currentZone) {
    if (!dailyEvent?.spawnMult) return 1;
    if (!dailyEvent.zoneIds || dailyEvent.zoneIds.includes(zoneId)) return dailyEvent.spawnMult;
    return 1;
}

const BARISTA_RANKS = [
    { level: 1, minCups: 0, name: 'Tập Sự Hẻm', priceMult: 1.0, energySave: 0 },
    { level: 2, minCups: 25, name: 'Pha Chế Quen Tay', priceMult: 1.05, energySave: 0 },
    { level: 3, minCups: 75, name: 'Chủ Quán Sành Điệu', priceMult: 1.10, energySave: 1 },
    { level: 4, minCups: 160, name: 'Bậc Thầy Cà Phê Sài Gòn', priceMult: 1.15, energySave: 1 }
];
const SIGNATURE_RECIPES = [
    {
        id: 'sig_kem_bo',
        name: 'Cà Phê Kem Bơ',
        icon: '🥑',
        need: { coffee: 1, milk: 1, fruit: 1 },
        baseSellPrice: 52000,
        energyCost: 5,
        mentorId: 'phuong_vy',
        mentorName: 'Phương Vy',
        reqFriendship: 120,
        desc: 'Công thức Signature học từ Phương Vy'
    },
    {
        id: 'sig_ca_phe_trung',
        name: 'Cà Phê Trứng Cổ Điển',
        icon: '🥚',
        need: { coffee: 2, milk: 1 },
        baseSellPrice: 50000,
        energyCost: 5,
        mentorId: 'ong_bay',
        mentorName: 'Ông Bảy',
        reqFriendship: 120,
        desc: 'Công thức Signature học từ Ông Bảy'
    },
    {
        id: 'sig_tra_sen_vang',
        name: 'Trà Sen Vàng Sài Gòn',
        icon: '🪷',
        need: { fruit: 2, milk: 1 },
        baseSellPrice: 48000,
        energyCost: 5,
        mentorId: 'ba_sau',
        mentorName: 'Bà Sáu',
        reqFriendship: 120,
        desc: 'Công thức Signature học từ Bà Sáu'
    }
];
const STARTER_RECIPE_IDS = ['ca_phe_den', 'ca_phe_sua', 'bac_xiu'];
const unlockedRecipes = new Set(STARTER_RECIPE_IDS);
const recipeQuestStats = {
    fruitBought: 0,
    cupsOutsideHome: 0,
    npcDrinksGifted: 0,
    traCamSaSold: 0,
    questsOrShipsDone: 0
};
const RECIPE_UNLOCK_QUESTS = {
    tra_cam_sa: {
        mentor: 'Cô Ba Tạp Hóa',
        rewardRep: 1,
        check: () => recipeQuestStats.fruitBought >= 1 && recipeQuestStats.cupsOutsideHome >= 3,
        shortProgress: () => `Mua 🍊 Cô Ba (${Math.min(1, recipeQuestStats.fruitBought)}/1) · Bán ngoài hẻm (${Math.min(3, recipeQuestStats.cupsOutsideHome)}/3)`,
        hint: () => `📜 Nhiệm vụ Cô Ba mở 🍹 Trà Cam Sả: Mua 1 rổ Trái Cây tại Tiệm Cô Ba (${Math.min(1, recipeQuestStats.fruitBought)}/1) và đẩy xe [G] sang khu khác (vd: Công Viên) bán 3 ly (${Math.min(3, recipeQuestStats.cupsOutsideHome)}/3)!`
    },
    cam_ep: {
        mentor: 'Bé Út',
        rewardRep: 1,
        check: () => unlockedRecipes.has('tra_cam_sa') && recipeQuestStats.npcDrinksGifted >= 2 && recipeQuestStats.traCamSaSold >= 4,
        shortProgress: () => `Mời nước cư dân (${Math.min(2, recipeQuestStats.npcDrinksGifted)}/2) · Pha Trà Cam Sả (${Math.min(4, recipeQuestStats.traCamSaSold)}/4)`,
        hint: () => `📜 Nhiệm vụ Bé Út mở 🍊 Nước Cam Ép: Mời nước 2 cư dân khi trò chuyện (${Math.min(2, recipeQuestStats.npcDrinksGifted)}/2) và phục vụ 4 ly 🍹 Trà Cam Sả (${Math.min(4, recipeQuestStats.traCamSaSold)}/4)!`
    },
    cold_brew_dac_biet: {
        mentor: 'Chú Tư',
        rewardRep: 2,
        check: () => totalCupsSold >= 18 && (cityReputation >= 10 || Object.keys(rentedProperties).length >= 1) && recipeQuestStats.questsOrShipsDone >= 1,
        shortProgress: () => `Bán (${Math.min(18, totalCupsSold)}/18) · DT/Quán (${(cityReputation >= 10 || Object.keys(rentedProperties).length >= 1) ? '✓' : `${cityReputation}/10`}) · NV/Ship (${Math.min(1, recipeQuestStats.questsOrShipsDone)}/1)`,
        hint: () => `📜 Nhiệm vụ Chú Tư mở ✨ Cold Brew Cam Sữa: Bán tổng 18 ly (${Math.min(18, totalCupsSold)}/18), đạt 10 Danh tiếng hoặc thuê 1 quán, và hoàn thành 1 Bảng Tin Hẻm hoặc 1 đơn Ship [F] (${Math.min(1, recipeQuestStats.questsOrShipsDone)}/1)!`
    }
};
const unlockedSignatures = new Set();
let totalCupsSold = 0;
let totalRevenueEarned = 0;

function isRecipeUnlocked(recipeId) {
    return unlockedRecipes.has(recipeId) || unlockedSignatures.has(recipeId);
}

function getUnlockedBaseRecipes() {
    const list = GAME_CONFIG.RECIPES.filter((r) => unlockedRecipes.has(r.id));
    return list.length ? list : [GAME_CONFIG.RECIPES[0]];
}

function getBaristaRank(cups = totalCupsSold) {
    let cur = BARISTA_RANKS[0];
    for (const r of BARISTA_RANKS) {
        if (cups >= r.minCups) cur = r;
    }
    return cur;
}

function getAvailableRecipes() {
    return [
        ...getUnlockedBaseRecipes(),
        ...SIGNATURE_RECIPES.filter((r) => unlockedSignatures.has(r.id))
    ];
}

function getBrewDisplayRecipes() {
    return [
        ...GAME_CONFIG.RECIPES,
        ...SIGNATURE_RECIPES.filter((r) => unlockedSignatures.has(r.id))
    ];
}

function getRecipeQuestHint(recipeId) {
    const q = RECIPE_UNLOCK_QUESTS[recipeId];
    return q ? q.hint() : "🔒 Hoàn thành nhiệm vụ để mở khóa món này!";
}

function getRecipeByIndex(idx) {
    const list = getAvailableRecipes();
    return list[idx] || list[0];
}

let checkingRecipeQuests = false;
function checkRecipeUnlockQuests() {
    if (checkingRecipeQuests) return;
    checkingRecipeQuests = true;
    try {
        let unlockedAny = true;
        while (unlockedAny) {
            unlockedAny = false;
            for (const [recipeId, quest] of Object.entries(RECIPE_UNLOCK_QUESTS)) {
                if (unlockedRecipes.has(recipeId)) continue;
                if (!quest.check()) continue;

                // Bảo toàn món khách đang gọi trước khi danh sách món mở khóa đổi chỉ số
                const prevAvail = getAvailableRecipes();
                const savedOrders = streetCustomers.map((c) => (prevAvail[c.wantedRecipeIdx] || prevAvail[0])?.id || null);

                unlockedRecipes.add(recipeId);
                unlockedAny = true;

                const nextAvail = getAvailableRecipes();
                streetCustomers.forEach((c, i) => {
                    const targetId = savedOrders[i];
                    if (targetId) {
                        const newIdx = nextAvail.findIndex((r) => r.id === targetId);
                        if (newIdx >= 0) c.wantedRecipeIdx = newIdx;
                    }
                });

                const rec = GAME_CONFIG.RECIPES.find((r) => r.id === recipeId);
                const rName = rec ? `${rec.icon} ${rec.name}` : recipeId;
                addCityReputation(quest.rewardRep || 1);
                GameAudio?.playUnlock();
                addScreenPopup(500, 166, `🔓 MỞ KHÓA MÓN MỚI: ${rName}!`, "#f0b643");
                showToast(`🎉 Xong thử thách ${quest.mentor}! Đã mở khóa món mới [${rName}] (+${quest.rewardRep || 1} Danh tiếng)!`, 320);
            }
        }
    } finally {
        checkingRecipeQuests = false;
    }
}

// ============================================================================
// BẢNG TIN HẺM 54 (NHIỆM VỤ HẰNG NGÀY) & KHÁCH VIP FOOD REVIEWER
// ============================================================================
const alleyBoard = { x: 1030, y: 406, w: 38, h: 42 };
let vipSpawnedToday = false;
let vipRushTimer = 0;

function rollDailyQuest() {
    const roll = Math.random();
    if (roll < 0.40) {
        const zonePool = ['HOME_STREET', 'PARK', 'BETTER_STREET', 'CANAL_MARKET', 'VILLAS', 'OFFICE_DISTRICT', 'DOWNTOWN', 'ELDERLY_AREA', 'BREEZE_AREA'];
        const targetZone = zonePool[Math.floor(Math.random() * zonePool.length)];
        const zName = GAME_CONFIG.ZONES[targetZone]?.name || targetZone;
        const target = 2 + Math.floor(Math.random() * 2);
        return {
            kind: 'sell_zone',
            targetZone,
            target,
            progress: 0,
            completed: false,
            rewardMoney: 220000,
            rewardRep: 2,
            title: `Bán ${target} ly nước tại ${zName}`
        };
    }
    if (roll < 0.70) {
        const pool = getUnlockedBaseRecipes();
        const recipe = pool[Math.floor(Math.random() * pool.length)];
        const target = 2;
        return {
            kind: 'sell_drink',
            recipeId: recipe.id,
            target,
            progress: 0,
            completed: false,
            rewardMoney: 180000,
            rewardRep: 1,
            title: `Phục vụ ${target} ly ${recipe.name}`
        };
    }
    if (roll < 0.86) {
        return {
            kind: 'gift_npc',
            target: 1,
            progress: 0,
            completed: false,
            rewardMoney: 150000,
            rewardRep: 1,
            title: 'Mời nước hoặc tặng quà 1 cư dân'
        };
    }
    return {
        kind: 'talk_npcs',
        target: 3,
        progress: 0,
        completed: false,
        rewardMoney: 140000,
        rewardRep: 1,
        title: 'Trò chuyện làm quen với 3 người dân'
    };
}
let dailyQuest = rollDailyQuest();

function recordDailyQuestProgress(kind, meta = {}) {
    if (!dailyQuest || dailyQuest.completed || dailyQuest.kind !== kind) return;
    if (kind === 'sell_zone' && meta.zone !== dailyQuest.targetZone) return;
    if (kind === 'sell_drink' && meta.recipeId !== dailyQuest.recipeId) return;
    dailyQuest.progress = Math.min(dailyQuest.target, (dailyQuest.progress || 0) + 1);
    if (dailyQuest.progress >= dailyQuest.target) {
        dailyQuest.completed = true;
        recipeQuestStats.questsOrShipsDone += 1;
        playerStats.money += dailyQuest.rewardMoney;
        dailyReport.revenue += dailyQuest.rewardMoney;
        addCityReputation(dailyQuest.rewardRep);
        GameAudio?.playUnlock();
        addScreenPopup(110, 56, `+${dailyQuest.rewardMoney.toLocaleString('vi-VN')}đ`, "#2ecc71");
        addScreenPopup(500, 128, `📋 Hoàn thành Nhiệm vụ ngày! +${dailyQuest.rewardRep} Danh tiếng`, "#f0b643");
        showToast(`📋 Xong Bảng Tin Hẻm: "${dailyQuest.title}" · Thưởng +${moneyLabel(dailyQuest.rewardMoney)} & +${dailyQuest.rewardRep} Danh tiếng!`, 280);
        checkRecipeUnlockQuests();
    }
}

// ============================================================================
// HỆ THỐNG CHỈ DẪN 3 TẦNG (TÂN THỦ 6 BƯỚC + LỘ TRÌNH NĂM 1 + MŨI TÊN ĐỊNH HƯỚNG)
// ============================================================================
const TUTORIAL_STEPS = [
    {
        id: 'LEAVE_HOME',
        title: 'Ra khỏi nhà khám phá Hẻm 54',
        hint: 'Đi xuống cửa phía dưới phòng hoặc nhấn [E] để ra phố.'
    },
    {
        id: 'BUY_MARKET',
        title: 'Ghé Tiệm Cô Ba mua nguyên liệu',
        hint: 'Đi theo mũi tên xuống phía Nam Hẻm 54 vào Tiệm Cô Ba (giảm 20% trước 08:00).'
    },
    {
        id: 'FIRST_BREW',
        title: 'Pha ly đầu tiên tại Xe Cà Phê',
        hint: 'Lại Xe Cà Phê [E], đợi khách tới (tiếng chuông) rồi bấm đúng món khách gọi.'
    },
    {
        id: 'TALK_NPC',
        title: 'Làm quen 1 hàng xóm trong phố',
        hint: 'Lại gần cư dân có tên (Bé Út, Anh Hưng, Chú Tư...) nhấn [E] hoặc chạm để nói chuyện.'
    },
    {
        id: 'EXPLORE_ZONE',
        title: 'Khám phá khu phố khác (vd: Công Viên)',
        hint: 'Mở Bản đồ [M] để đi nhanh, hoặc nhấn [G] đẩy Xe Cà Phê đi qua mép đường sang khu mới.'
    },
    {
        id: 'SLEEP_SAVE',
        title: 'Về nhà lên giường ngủ & lưu Cloud',
        hint: 'Mở Bản đồ [M] → Nhà của mình, lại gần Giường nhấn [E] để tổng kết ngày & nhận thưởng tân thủ!'
    }
];
let tutorialStep = 0;
let tutorialSkipped = false;
let lowEnergyWarned = false;

function isTutorialActive() {
    return !tutorialSkipped && tutorialStep < TUTORIAL_STEPS.length;
}

function completeTutorialStep(stepIdx) {
    if (!isTutorialActive() || tutorialStep !== stepIdx) return false;
    tutorialStep = stepIdx + 1;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        playerStats.money += 500000;
        addCityReputation(2);
        GameAudio?.playUnlock();
        addScreenPopup(110, 56, "+500.000đ", "#2ecc71");
        addScreenPopup(500, 140, "🎓 HOÀN THÀNH TÂN THỦ! +500k & +2 Danh tiếng", "#f0b643");
        showToast("🎓 Chúc mừng hoàn thành Hướng Dẫn Tân Thủ! Thưởng Quỹ Khởi Nghiệp +500.000đ & +2 Danh tiếng!", 320);
        return true;
    } else {
        GameAudio?.playClick();
        const next = TUTORIAL_STEPS[tutorialStep];
        addScreenPopup(500, 118, `✅ Bước tiếp (${tutorialStep + 1}/6): ${next.title}`, "#f0b643");
        return false;
    }
}

function getActiveCareerMilestone() {
    const rentedCount = Object.keys(rentedProperties).length;
    if (rentedCount === 0) {
        return {
            title: 'Thuê Mặt Bằng đầu tiên (Hẻm 54 · 4.5Tr)',
            hint: 'Tích 5.5Tr (thuê + vốn mở) rồi lại Mặt Bằng Hẻm 54 bên trái nhà để mở quán đầu tiên!',
            zone: 'HOME_STREET', x: 395, y: 435, label: 'Mặt Bằng Hẻm 54',
            showArrow: playerStats.money >= 5500000
        };
    }
    if (fridgeLevel === 0 && !coffeeCart.umbrella && !coffeeCart.seating) {
        return {
            title: 'Nâng cấp Tủ Lạnh ở nhà hoặc Dù/Ghế Xe CF',
            hint: 'Bấm Tủ Lạnh trong phòng ngủ (2.5Tr giữ nguyên liệu tươi lâu) hoặc ghé Tiệm Sửa Xe đầu Hẻm 54.',
            zone: 'HOME_STREET', x: 168, y: 920, label: 'Tiệm Sửa Xe',
            showArrow: false
        };
    }
    if (ownedVehicles.size === 0) {
        return {
            title: 'Mua xe tại Showroom để mở Ship hàng [F]',
            hint: 'Sang Trung Tâm Sầm Uất → Showroom Siêu Xe (Xe đạp chỉ 1.5Tr giúp chạy nhanh & nhận đơn Ship).',
            zone: 'DOWNTOWN', x: 1390, y: 420, label: 'Showroom Xe',
            showArrow: currentZone === 'DOWNTOWN'
        };
    }
    if (unlockedSignatures.size === 0) {
        return {
            title: 'Kết thân (120đ) học món Signature đầu tiên',
            hint: 'Trò chuyện & mời nước Phương Vy (Phố Đắt Hơn), Ông Bảy hoặc Bà Sáu (Khu Người Già).',
            showArrow: false
        };
    }
    if (rentedCount < 2 || cityReputation < 30) {
        return {
            title: `Mở rộng chuỗi quán (${rentedCount}/2) & 30 Danh tiếng`,
            hint: 'Làm Bảng Tin Hẻm, Ship hàng [F], Lễ hội Công Viên & phục vụ khách VIP để tăng Danh tiếng TP.',
            showArrow: false
        };
    }
    if (!yearTwo.backpack && (playerStats.year >= 2 || playerStats.dayOfYear >= 75)) {
        return {
            title: 'Mua Ba Lô Đi Tỉnh (250k) tại Tiệm Cô Ba',
            hint: 'Vào Tiệm Tạp Hóa Cô Ba ở Hẻm 54 mua Ba Lô để chuẩn bị săn đặc sản Năm 2!',
            zone: 'HOME_STREET', x: 930, y: 1005, label: 'Tiệm Cô Ba',
            showArrow: currentZone === 'HOME_STREET'
        };
    }
    if (playerStats.year < 2) {
        return {
            title: `Chinh phục 100 ngày Năm 1 (Ngày ${playerStats.dayOfYear}/100)`,
            hint: 'Phát triển chuỗi quán, lên Barista Lv.4 và kết hôn để đạt hạng S Tổng Kết Năm 1!',
            showArrow: false
        };
    }
    return {
        title: 'Lên xe khách Khu Đón Gió (09:00) săn đặc sản!',
        hint: 'Ghé Bến Xe Liên Tỉnh ở Khu Đón Gió trước 09:00 để đi Đà Lạt · Miền Tây · Vũng Tàu.',
        zone: 'BREEZE_AREA', x: 425, y: 310, label: 'Bến Xe',
        showArrow: currentZone === 'BREEZE_AREA'
    };
}

function getActiveGuideTarget() {
    if (isTutorialActive()) {
        const step = TUTORIAL_STEPS[tutorialStep];
        let title = step.title;
        let hint = step.hint;
        let target = null;
        if (tutorialStep === 0) {
            if (currentGameState === GAME_STATES.PLAYING_HOME) {
                target = { mode: 'HOME', x: 500, y: 452, label: 'Cửa ra phố' };
            }
        } else if (tutorialStep === 1) {
            if (playerStats.hour >= GAME_CONFIG.TIME.MARKET_CLOSE_HOUR) {
                title = 'Chợ Cô Ba đã đóng (18:30) · Về ngủ mai mua tiếp';
                hint = 'Tiệm Cô Ba mở từ 05:00–18:30. Mở [M] về Nhà ngủ tới sáng mai để mua giá sỉ giảm 20%!';
                if (currentGameState === GAME_STATES.PLAYING_HOME) {
                    target = { mode: 'HOME', x: 252, y: 165, label: 'Giường ngủ' };
                } else if (!indoorShop && currentZone === 'HOME_STREET') {
                    target = { mode: 'WORLD', x: 945, y: 425, label: 'Về nhà ngủ' };
                }
            } else if (currentGameState === GAME_STATES.PLAYING_HOME) {
                target = { mode: 'HOME', x: 500, y: 452, label: 'Ra phố' };
            } else if (indoorShop?.market) {
                target = { mode: 'SHOP', x: 500, y: 235, label: 'Quầy Cô Ba' };
            } else if (!indoorShop && currentZone === 'HOME_STREET') {
                target = { mode: 'WORLD', x: 930, y: 1005, label: 'Tiệm Cô Ba' };
            }
        } else if (tutorialStep === 2) {
            if (currentGameState === GAME_STATES.PLAYING_HOME) {
                target = { mode: 'HOME', x: 500, y: 452, label: 'Ra phố' };
            } else if (indoorShop) {
                target = { mode: 'SHOP', x: 500, y: 515, label: 'Ra ngoài' };
            } else if (coffeeCart.isPushed) {
                title = 'Nhấn [G] đậu Xe Cà Phê rồi pha ly đầu tiên';
                hint = 'Nhấn [G] để đậu xe xuống vỉa hè, đứng lại gần [E] rồi đợi khách gọi món.';
            } else if (currentZone === coffeeCart.zone) {
                target = { mode: 'WORLD', x: coffeeCart.x + 44, y: coffeeCart.y + 18, label: 'Xe Cà Phê' };
            } else {
                const cartZoneName = GAME_CONFIG.ZONES[coffeeCart.zone]?.name || coffeeCart.zone;
                hint = `Xe Cà Phê đang đậu ở ${cartZoneName}. Mở Bản đồ [M] để quay về xe!`;
            }
        } else if (tutorialStep === 3) {
            if (currentGameState === GAME_STATES.PLAYING_HOME) {
                target = { mode: 'HOME', x: 500, y: 452, label: 'Ra phố' };
            } else if (indoorShop) {
                target = { mode: 'SHOP', x: 500, y: 515, label: 'Ra ngoài' };
            } else if (currentGameState === GAME_STATES.PLAYING_STREET) {
                const visibleNpcs = storyNPCs.filter((n) => n.meeting?.zone === currentZone && !n.meeting.shop);
                if (visibleNpcs.length) {
                    let best = visibleNpcs[0];
                    let bestD = Infinity;
                    for (const n of visibleNpcs) {
                        const d = Math.hypot(n.x - player.x, n.y - player.y);
                        if (d < bestD) { bestD = d; best = n; }
                    }
                    target = { mode: 'WORLD', x: best.x + 18, y: best.y + 10, label: best.name };
                }
            }
        } else if (tutorialStep === 4) {
            if (!indoorShop && currentGameState === GAME_STATES.PLAYING_STREET && currentZone === 'HOME_STREET') {
                target = { mode: 'WORLD', x: 1940, y: 595, label: 'Qua khu mới' };
            }
        } else if (tutorialStep === 5) {
            if (currentGameState === GAME_STATES.PLAYING_HOME) {
                target = { mode: 'HOME', x: 252, y: 165, label: 'Giường ngủ' };
            } else if (!indoorShop && currentZone === 'HOME_STREET') {
                target = { mode: 'WORLD', x: 945, y: 425, label: 'Về nhà ngủ' };
            }
        }
        return {
            isTutorial: true,
            badge: `Tân thủ ${tutorialStep + 1}/${TUTORIAL_STEPS.length}`,
            title,
            hint,
            target
        };
    }

    const m = getActiveCareerMilestone();
    let target = null;
    if (m.showArrow && !indoorShop && currentGameState === GAME_STATES.PLAYING_STREET && currentZone === m.zone) {
        target = { mode: 'WORLD', x: m.x, y: m.y, label: m.label };
    }
    return {
        isTutorial: false,
        badge: 'Lộ trình',
        title: m.title,
        hint: m.hint,
        target
    };
}

function drawGuideBarInHUD() {
    if (indoorShop?.name.includes("BỆNH VIỆN")) return;
    const info = getActiveGuideTarget();
    const bx = 318;
    const by = 40;
    const bw = 514;
    const bh = 28;
    pOutlinedRect(ctx, bx, by, bw, bh, info.isTutorial ? "#fff2c6" : "#f3e5c8");
    ctx.textAlign = "left";
    ctx.fillStyle = info.isTutorial ? "#9c341e" : "#4a3525";
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    const textMaxW = info.isTutorial ? 430 : 494;
    ctx.fillText(`🎯 [${info.badge}] ${info.title}`, bx + 10, by + 19, textMaxW);

    if (info.isTutorial) {
        pOutlinedRect(ctx, bx + bw - 62, by + 4, 56, 20, "#dfd1b4");
        ctx.textAlign = "center";
        ctx.fillStyle = "#5c4033";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText("Bỏ qua", bx + bw - 34, by + 18, 52);
    }
}

function drawGuideCompassAndBeacon() {
    if (isAnyModalOpen()) return;
    const info = getActiveGuideTarget();
    const target = info.target;
    if (!target) return;

    let sx = target.x;
    let sy = target.y;
    if (target.mode === 'WORLD') {
        if (currentGameState !== GAME_STATES.PLAYING_STREET || indoorShop) return;
        sx = target.x - Math.round(camera.x);
        sy = target.y - Math.round(camera.y);
    } else if (target.mode === 'HOME') {
        if (currentGameState !== GAME_STATES.PLAYING_HOME) return;
    } else if (target.mode === 'SHOP') {
        if (!indoorShop) return;
    }

    const padX = 56;
    const padTop = 98;
    const padBottom = 64;
    const onScreen = sx >= padX && sx <= canvas.width - padX && sy >= padTop && sy <= canvas.height - padBottom;
    const bob = Math.sin(tickCount * 0.14) * 5;

    ctx.save();
    if (onScreen) {
        // Vẽ mũi tên vàng nhấp nháy ngay trên mục tiêu trong tầm mắt
        const ty = Math.max(padTop, sy - 40 + bob);
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        const lbl = `▼ ${target.label}`;
        const tw = Math.max(88, ctx.measureText(lbl).width + 20);
        pOutlinedRect(ctx, sx - tw / 2, ty - 22, tw, 26, "#f0b643");
        ctx.textAlign = "center";
        ctx.fillStyle = "#2b1d16";
        ctx.fillText(lbl, sx, ty - 4);
    } else {
        // Mục tiêu ngoài màn hình -> vẽ mũi tên định hướng ghim sát rìa màn hình
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const angle = Math.atan2(sy - cy, sx - cx);
        const edgeX = Math.max(82, Math.min(canvas.width - 82, sx));
        const edgeY = Math.max(122, Math.min(canvas.height - 64, sy));
        const arrow = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
            ? (Math.cos(angle) > 0 ? '➡' : '⬅')
            : (Math.sin(angle) > 0 ? '⬇' : '⬆');
        const distM = Math.max(1, Math.round(Math.hypot(sx - cx, sy - cy) / 40));
        const lbl = `${arrow} ${target.label} (${distM}m)`;
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        const tw = Math.max(132, ctx.measureText(lbl).width + 22);
        const bx = Math.max(16, Math.min(canvas.width - tw - 16, edgeX - tw / 2));
        const by = Math.max(114, Math.min(canvas.height - 76, edgeY - 15 + bob * 0.35));
        pOutlinedRect(ctx, bx, by, tw, 30, "#f0b643");
        ctx.textAlign = "center";
        ctx.fillStyle = "#2b1d16";
        ctx.fillText(lbl, bx + tw / 2, by + 20);
    }
    ctx.restore();
}

// Thống kê doanh thu trong ngày (hiển thị khi đi ngủ giống Stardew Valley)
const HOSPITAL_FEE = 1000000;
let faintedInHospital = false;
const BETTER_HOSPITAL = {
    zone: 'BETTER_STREET',
    x: 195,
    y: 785,
    w: 500,
    h: 250,
    doorX: 428,
    doorY: 1044
};

let dailyReport = {
    cupsSold: 0,
    revenue: 0,
    ingredientCost: 0,
    rentCost: 0,
    hospitalCost: 0,
    latePenalty: false
};

let currentZone = 'HOME_STREET';
let rentedProperties = {};
let nearbyRental = null;
let nearbyInteractable = null; // { type: 'MARKET' | 'CART' | 'RENTED_SHOP' | 'BED' | 'PC', label, data }

// Các bảng Modal tương tác (Khi mở Modal thì thời gian tự động Pause giống Stardew Valley)
const businessTypes = [
    { id: 'cafe', name: 'Quán cà phê', setup: 1000000, daily: 110000, idealRep: 10, minFactor: 0.35 },
    { id: 'florist', name: 'Shop hoa', setup: 2800000, daily: 260000, idealRep: 20, minFactor: 0.25 },
    { id: 'bakery', name: 'Tiệm bánh', setup: 3800000, daily: 340000, idealRep: 30, minFactor: 0.20 },
    { id: 'fashion', name: 'Shop quần áo', setup: 4800000, daily: 420000, idealRep: 45, minFactor: 0.15 },
    { id: 'restaurant', name: 'Nhà hàng', setup: 6500000, daily: 520000, idealRep: 60, minFactor: 0.12 },
    { id: 'coworking', name: 'Co-working & Cà Phê Sách', setup: 8500000, daily: 700000, idealRep: 75, minFactor: 0.10 },
    { id: 'lounge', name: 'Lounge / Bar Acoustic', setup: 15000000, daily: 1250000, idealRep: 90, minFactor: 0.08 }
];

function getBusinessReputationFactor(type) {
    const ideal = type?.idealRep || 10;
    const minF = type?.minFactor ?? 0.25;
    if (cityReputation < ideal) {
        const ratio = Math.max(0, cityReputation / ideal);
        return minF + (1 - minF) * Math.pow(ratio, 1.25);
    }
    const overRatio = (cityReputation - ideal) / Math.max(10, 100 - ideal + 10);
    return Math.min(1.25, 1.0 + overRatio * 0.25 + (customerReputation || 0) / 1000);
}

function getBusinessRentDue(business) {
    const share = business?.partner?.share || 0;
    return Math.round(((business?.rental?.price || 0) * (1 - share)) / 1000) * 1000;
}

function getDaysUntilNextRent() {
    const rem = playerStats.dayOfYear % 25;
    return rem === 0 ? 25 : 25 - rem;
}
let businessDraft = null;
const businesses = {};
const rejectedPartners = new Set();
const investigatedPartners = new Set();
const moneyLabel = (amount) => amount.toLocaleString('vi-VN') + 'đ';

let selectedRentalModal = null;
let showMapModal = false;
let showNPCSchedule = false;
let showWallCalendar = false;
let showFestivalPanel = false;
let festivalChoice = null;
let festivalPartner = null;
let festivalRoundStarted = 0;
let festivalResult = null;
const festivalPlaza = { x: 840, y: 700 };
const festivalStall = { x: 1180, y: 700 };
const bicycleRental = { x: 1480, y: 420, price: 20000 };
const showroomVehicles = [
    { id: 'bike', name: 'Xe đạp', price: 1500000, speed: 1.55, color: '#cc8057' },
    { id: 'scooter', name: 'Xe máy', price: 18000000, speed: 2.0, color: '#659ba5' },
    { id: 'car', name: 'Xe hơi', price: 220000000, speed: 2.45, color: '#7596ba' },
    { id: 'supercar', name: 'Siêu xe', price: 650000000, speed: 3.0, color: '#d35653' }
];
const ownedVehicles = new Set();
let activeVehicle = null;
let showGarage = false;

let ridingBicycle = false;
let selectedCalendarDay = 1;
const wallCalendar = { x: 585, y: 119, w: 92, h: 52 };
const roomTV = { x: 500, y: 118, w: 66, h: 50 };
const roomPC = { x: 212, y: 294, w: 46, h: 66 };
const roomFridge = { x: 718, y: 138, w: 58, h: 78 };
let showTVModal = false;
let showPCModal = false;
let pcModalTab = 'finance';
let showYearSummaryModal = false;
let yearOneSummarySeen = false;
let scheduleZone = 'HOME_STREET';
let showMarketModal = false;
let showBrewModal = false;
let showSleepSummaryModal = false;
let sleepForcedByMidnight = false;
let activeDialogueNPC = null;

let activeBrewSpot = null; // { spotId, name, zoneId }
let spotOrderCooldown = 240; // ~4 giây đầu có khách đầu tiên, sau đó ~19 giây (~38 phút game) mới có khách tiếp theo
const CART_BAIL_FEE = 2000000;
let coffeeCart = {
    zone: 'HOME_STREET',
    x: 1110,
    y: 382,
    isPushed: false,
    isOpen: true,
    seized: false,
    umbrella: false,
    seating: false
};
let marketInspector = {
    active: false,
    zone: null,
    x: 0,
    y: 0,
    dir: -1,
    animFrame: 0,
    animTimer: 0,
    patrolCooldown: 2400 + Math.floor(Math.random() * 2400)
};
let screenPopups = []; // Hiệu ứng bay chữ +/- trên màn hình khi mua đồ hoặc bán nước
let toastMessage = "";
let toastTimer = 0;
let floatingTexts = []; // Hiệu ứng bay chữ "+35.000đ", "-4 ⚡" trên đầu nhân vật

function showToast(msg, duration = 210) {
    toastMessage = msg;
    toastTimer = duration;
}

function addFloatingText(worldX, worldY, text, color = "#2ecc71") {
    floatingTexts.push({
        x: worldX,
        y: worldY,
        text: text,
        color: color,
        alpha: 1.0,
        life: 70
    });
}

function addScreenPopup(x, y, text, color = "#2ecc71") {
    screenPopups.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 85
    });
}

let player = {
    x: 930,
    y: 465,
    size: 36,
    speed: 3.1, // Tốc độ dạo bộ mượt mà trên bản đồ lớn 2000x1400
    dir: 'down',
    isMoving: false,
    animFrame: 0,
    animTimer: 0
};

let keys = {
    w: false, s: false, a: false, d: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
};

function isAnyModalOpen() {
    return !!(showBusRoutes || busScene || showYearSummaryModal || yearTwo.showTrailer || showTVModal || showPCModal || showHandbookModal || showDeliveryModal || showManagementModal || showBankModal || showGarage || showShopMenu || showFestivalPanel || showWallCalendar || showNPCSchedule || showMapModal || selectedRentalModal || showMarketModal || showBrewModal || showSleepSummaryModal || activeDialogueNPC);
}

function isTimePausedModalOpen() {
    return !!(showBusRoutes || busScene || showYearSummaryModal || yearTwo.showTrailer || showTVModal || showPCModal || showHandbookModal || showDeliveryModal || showManagementModal || showBankModal || showGarage || showShopMenu || showFestivalPanel || showWallCalendar || showNPCSchedule || showMapModal || selectedRentalModal || showMarketModal || showSleepSummaryModal || activeDialogueNPC);
}

function closeAllModals() {
    showBusRoutes = false;
    showTVModal = false;
    showPCModal = false;
    showHandbookModal = false;
    showDeliveryModal = false;
    showManagementModal = false;
    showBankModal = false;
    showGarage = false;
    showShopMenu = false;
    outfitPreview = null;
    showWallCalendar = false;
    showFestivalPanel = false;
    showNPCSchedule = false;
    showMapModal = false;
    selectedRentalModal = null;
    businessDraft = null;
    showMarketModal = false;
    showBrewModal = false;
    if (activeDialogueNPC?.briefingLines) delete activeDialogueNPC.briefingLines;
    activeDialogueNPC = null;
}

function resetAllMovementKeys() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

window.addEventListener('blur', resetAllMovementKeys);

window.addEventListener('keydown', function (e) {
    if (window.GameAudio) GameAudio.unlock();
    if (currentGameState === GAME_STATES.WELCOME && (e.key === 'Enter' || e.key === ' ')) {
        GameAudio?.playClick();
        currentGameState = GAME_STATES.MENU;
        return;
    }
    if (currentGameState === GAME_STATES.INTRO && e.key === 'Enter') {
        finishIntro();
        return;
    }
    if (showYearSummaryModal && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key.toLowerCase() === 'e')) {
        showYearSummaryModal = false;
        yearTwo.showTrailer = true;
        GameAudio?.playUnlock();
        return;
    }
    if (yearTwo.showTrailer && (e.key === 'Enter' || e.key === 'Escape' || e.key.toLowerCase() === 'e')) { yearTwo.showTrailer = false; return; }
    if ((document.activeElement === nameInput || document.activeElement === birthdayInput || !document.getElementById('authModal')?.hidden)) return;
    const low = e.key.toLowerCase();
    if (busScene) return;
    if (showBusRoutes) {
        if (low === 'q' || low === 'escape') showBusRoutes = false;
        if (!e.repeat && /^[1-3]$/.test(low)) departByBus(busRoutes[Number(low) - 1]);
        return;
    }
    if (!isAnyModalOpen()) {
        if (e.key in keys) keys[e.key] = true;
        if (low in keys) keys[low] = true;
    } else {
        resetAllMovementKeys();
    }

    if (currentGameState === GAME_STATES.MENU) {
        if (showHandbookModal) {
            if (low === '1') {
                handbookTab = 'guide';
                GameAudio?.playClick();
            } else if (low === '2') {
                handbookTab = 'schedule';
                GameAudio?.playClick();
            } else if (low === 'l' && !e.repeat) {
                toggleNPCSchedule();
            } else if (low === 'q' || low === 'b' || e.key === 'Escape') {
                showHandbookModal = false;
                GameAudio?.playModalClose();
            }
            return;
        }
        if (low === 'b' && !showSettingsModal && !e.repeat) {
            handbookTab = 'guide';
            showHandbookModal = true;
            GameAudio?.playModalOpen();
            return;
        }
        if (showSettingsModal && (low === 'q' || e.key === 'Escape')) {
            showSettingsModal = false;
            return;
        }
    }

    if (currentGameState === GAME_STATES.PLAYING_STREET || currentGameState === GAME_STATES.PLAYING_HOME) {
        if (showSleepSummaryModal) {
            if (e.repeat) return;
            if (!sleepForcedByMidnight && (e.key === 'Escape' || low === 'q')) {
                showSleepSummaryModal = false;
                GameAudio?.playModalClose();
                showToast("🛏️ Đã rời khỏi giường, tiếp tục hoạt động!");
                return;
            }
            if (needsFirstSaveSlotChoice && /^[1-3]$/.test(low) && window.GameCloud) {
                GameCloud.activeSlot = Number(low) - 1;
                GameAudio?.playClick();
            } else if (low === 'e' || e.key === ' ' || e.key === 'Enter') {
                needsFirstSaveSlotChoice = false;
                confirmStartNextDay();
            }
            return;
        }

        if (low === 'b' && !e.repeat) {
            if (showHandbookModal && handbookTab === 'guide') {
                showHandbookModal = false;
                GameAudio?.playModalClose();
            } else {
                closeAllModals();
                handbookTab = 'guide';
                showHandbookModal = true;
                GameAudio?.playModalOpen();
            }
            return;
        }
        if (low === 'f' && !e.repeat && !indoorShop) {
            if (!hasDeliveryVehicle()) return;
            if (showDeliveryModal) {
                showDeliveryModal = false;
                GameAudio?.playModalClose();
            } else {
                closeAllModals();
                if (!deliveryOffers.length) generateDeliveryOffers();
                showDeliveryModal = true;
                GameAudio?.playModalOpen();
            }
            return;
        }
        if (showDeliveryModal && (low === 'q' || e.key === 'Escape')) {
            showDeliveryModal = false;
            GameAudio?.playModalClose();
            return;
        }
        if (showHandbookModal) {
            if (low === '1') {
                handbookTab = 'guide';
                GameAudio?.playClick();
            } else if (low === '2') {
                handbookTab = 'schedule';
                scheduleZone = currentGameState === GAME_STATES.PLAYING_HOME ? 'HOME_STREET' : (currentZone || 'HOME_STREET');
                GameAudio?.playClick();
            } else if (low === 'l' && !e.repeat) {
                toggleNPCSchedule();
            } else if (low === 'q' || e.key === 'Escape') {
                showHandbookModal = false;
                GameAudio?.playModalClose();
            }
            return;
        }
        if (indoorShop) {
            if (showBankModal) { if (low === 'q' || low === 'escape') closeAllModals(); else if(low==='e') takeBankLoan(); return; }
            if (showManagementModal) { if (low === 'q' || low === 'escape') closeAllModals(); return; }
            if (low === 'escape') {
                if (isAnyModalOpen()) closeAllModals();
                return;
            }
            if (low === 'q') {
                if (isAnyModalOpen()) closeAllModals();
                else leaveShop();
            } else if (low === 'e' && activeDialogueNPC) advanceDialogue();
            else if (low === 'e' && !isAnyModalOpen() && indoorShop.nightlife && indoorShop.name.includes("SKYLINE") && player.y < 315 && player.x >= 325 && player.x <= 450) {
                const kyDuyen = getShopVisitors(indoorShop).find((npc) => npc.id === 'ky_duyen');
                if (kyDuyen) openNPCDialogue(kyDuyen);
            } else if (low === 'e' && !isAnyModalOpen() && player.y >= 368 && player.y <= 465) {
                const floorVisitors = indoorShop.nightlife && indoorShop.name.includes("SKYLINE")
                    ? getShopVisitors(indoorShop).filter((npc) => npc.id !== 'ky_duyen')
                    : getShopVisitors(indoorShop);
                const visitor = floorVisitors.find((npc, index) => Math.abs(player.x - getShopVisitorX(index, floorVisitors.length)) < 52);
                if (visitor) openNPCDialogue(visitor);
            } else if (low === 'e' && !isAnyModalOpen() && indoorShop.name.includes("BỆNH VIỆN") && player.x >= 775 && player.y <= 280) {
                switchHospitalFloor((hospitalFloor + 1) % 3);
            } else if (low === 'e' && !isAnyModalOpen() && player.y < (indoorShop.name.includes("BỆNH VIỆN") ? 305 : 315) &&
                player.x >= (indoorShop.nightlife ? 530 : 320) && player.x <= (indoorShop.nightlife ? 775 : 680)) useShopCounter();
            else if (!isAnyModalOpen() && indoorShop.name.includes("BỆNH VIỆN") && /^[1-3]$/.test(low)) {
                switchHospitalFloor(Number(low) - 1);
            }
            else if (showBrewModal && /^[1-9]$/.test(low)) {
                const idx = Number(low) - 1;
                const rec = getBrewDisplayRecipes()[idx];
                if (rec) {
                    if (isRecipeUnlocked(rec.id)) brewAndSellDrink(rec);
                    else { GameAudio?.playClick(); showToast(getRecipeQuestHint(rec.id), 300); }
                }
            } else if (low === 'k' && !e.repeat && indoorShop.rental && !showBankModal && !showManagementModal) {
                closeAllModals();
                selectedManagementShop = indoorShop.rental;
                showManagementModal = true;
                GameAudio?.playModalOpen();
            }
            return;
        }

        if (showGarage) {
            if (low === 'q' || low === 'escape' || (low === 'v' && !e.repeat)) closeAllModals();
            return;
        }
        if (low === 'v' && !e.repeat && currentGameState === GAME_STATES.PLAYING_STREET && !isAnyModalOpen()) {
            showGarage = true;
            return;
        }

        if (showPCModal) {
            if (low === '1') { pcModalTab = 'finance'; GameAudio?.playClick(); }
            else if (low === '2') { pcModalTab = 'fridge'; GameAudio?.playClick(); }
            else if (low === 'q' || e.key === 'Escape') { showPCModal = false; GameAudio?.playModalClose(); }
            return;
        }
        if (showWallCalendar || showFestivalPanel) {
            if (low === 'q' || low === 'escape') closeAllModals();
            return;
        }
        if (low === 'l' && !e.repeat) {
            toggleNPCSchedule();
        } else if (showNPCSchedule && low !== 'q' && low !== 'escape') {
            return;
        } else if (low === 'm') {
            const nextState = !showMapModal;
            closeAllModals();
            showMapModal = nextState;
        } else if (low === 'g' && currentGameState === GAME_STATES.PLAYING_STREET && !isAnyModalOpen()) {
            togglePushCoffeeCart();
        } else if (low === 'c' && !e.repeat && currentGameState === GAME_STATES.PLAYING_STREET && (!isAnyModalOpen() || (showBrewModal && activeBrewSpot?.spotId === 'cart_mobile'))) {
            toggleCoffeeCartOpen();
        } else if (low === 'h' && !e.repeat && currentGameState === GAME_STATES.PLAYING_STREET && !isAnyModalOpen()) {
            if (ridingBicycle || activeVehicle?.id === 'bike') GameAudio?.playBikeBell(0.24);
            else if (activeVehicle) GameAudio?.playHorn(0, 0.22);
        } else if (low === 'q' || low === 'escape') {
            closeAllModals();
        } else if ((low === 'e' || e.key === ' ') && !e.repeat) {
            if (activeDialogueNPC) {
                advanceDialogue();
            } else if (selectedRentalModal && !businessDraft) {
                attemptRentProperty(selectedRentalModal);
            } else if (showMarketModal || showBrewModal) {
                // Đang mở bảng chợ hoặc pha chế thì phím E không tự đóng
            } else if (nearbyInteractable) {
                triggerInteractable(nearbyInteractable);
            } else if (nearbyRental && currentGameState === GAME_STATES.PLAYING_STREET) {
                selectedRentalModal = nearbyRental;
            }
        } else if (/^[1-9]$/.test(low) && showBrewModal) {
            const idx = Number(low) - 1;
            const rec = getBrewDisplayRecipes()[idx];
            if (rec) {
                if (isRecipeUnlocked(rec.id)) brewAndSellDrink(rec);
                else { GameAudio?.playClick(); showToast(getRecipeQuestHint(rec.id), 300); }
            }
        }
    }
});

window.addEventListener('keyup', function (e) {
    if (e.key in keys) keys[e.key] = false;
    const low = e.key.toLowerCase();
    if (low in keys) keys[low] = false;
});

// Xe máy chạy thong thả trên trục đường chính (y = 555..635 trên bản đồ 2000x1400)
let streetMotorbikes = [
    { x: 280, y: 560, speed: 1.35, dir: 1, bikeColor: "#dbd3c5", shirtColor: "#918c9e", hat: "nonla" },
    { x: 1550, y: 625, speed: -1.45, dir: -1, bikeColor: "#7a3b32", shirtColor: "#8a99a6", hat: "helmet" },
    { x: 960, y: 560, speed: 1.2, dir: 1, bikeColor: "#4a5259", shirtColor: "#d6ccb8", hat: "none" }
];

// Người đạp xe thể thao ở Khu Đón Gió (BREEZE_AREA)
let breezeCyclists = [
    { x: 250, y: 565, speed: 1.5, dir: 1, frameColor: "#2ecc71", shirtColor: "#f39c12" },
    { x: 1480, y: 625, speed: -1.4, dir: -1, frameColor: "#3498db", shirtColor: "#e74c3c" },
    { x: 880, y: 565, speed: 1.3, dir: 1, frameColor: "#f1c40f", shirtColor: "#2980b9" }
];

// Cô gánh hàng rong đi bộ thong thả trên vỉa hè rộng
let vendorNPC = {
    id: 'vendor_co_hang',
    name: "Cô Ba Hàng Rong",
    role: "Gánh hàng rong Hẻm 54",
    kind: 'resident',
    genderIndex: 1,
    shirt: "#7d5a78",
    shadow: "#593e55",
    shorts: "#2e2927",
    accessory: "none",
    x: 820,
    y: 475,
    dir: 1,
    speed: 0.45,
    animFrame: 0,
    animTimer: 0,
    friendship: 0,
    talkedToday: false,
    giftedToday: false,
    lovedDrink: 'ca_phe_sua',
    dialogueIndex: 0,
    dialogues: [
        "Gánh hàng rong của cô đi qua hẻm này từ lúc 5 giờ sáng lận đó con!",
        "Bán cà phê vỉa hè chịu khó để ý trời nắng mưa nha, trời nắng gắt khách thèm Bạc Xỉu lắm."
    ]
};

// Khách hàng NPC đi dạo và tự động lại Xe Cà Phê / Quán gọi món
let streetCustomers = [
    {
        id: 'cust_chu_tu', name: "Chú Tư", role: "Cư dân Hẻm 54", kind: 'resident',
        genderIndex: 0, x: 1020, y: 465, dir: 1, speed: 0.9, shirt: "#4f8a46", shadow: "#366130", shorts: "#2e3830", accessory: "none",
        wantedRecipeIdx: 0, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 120, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'ca_phe_den', dialogueIndex: 0,
        dialogues: [
            "Sáng nào chú cũng làm một ly Cà Phê Đen Đá mới tỉnh táo đi dạo được!",
            "Cháu pha đậm đà lắm, rảnh chú lại ghé ủng hộ tiếp nha."
        ]
    },
    {
        id: 'cust_chi_lan', name: "Chị Lan", role: "Nhân viên văn phòng", kind: 'resident',
        genderIndex: 1, x: 1320, y: 475, dir: -1, speed: 0.85, shirt: "#d97248", shadow: "#a34e2c", shorts: "#333942", accessory: "none",
        wantedRecipeIdx: 1, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 40, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'ca_phe_sua', dialogueIndex: 0,
        dialogues: [
            "Chào em! Sáng nào đi làm chị cũng ghé ngang kiếm ly Cà Phê Sữa Đá.",
            "Nếu sau này em mở quán rộng có máy lạnh thì đồng nghiệp chị kéo qua đông lắm đó!"
        ]
    },
    {
        id: 'cust_anh_minh', name: "Anh Minh", role: "Tài xế công nghệ", kind: 'resident',
        genderIndex: 0, x: 760, y: 745, dir: 1, speed: 0.9, shirt: "#3b78b8", shadow: "#265282", shorts: "#2c3e50", accessory: "none",
        wantedRecipeIdx: 2, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 0, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'bac_xiu', dialogueIndex: 0,
        dialogues: [
            "Chạy xe ngoài đường nắng gió, có ly Bạc Xỉu mát lạnh là hết sảy!",
            "Em đẩy xe ra Công Viên bán thử đi, ngoài đó đông người dạo mát lắm."
        ]
    },
    {
        id: 'cust_ban_thao', name: "Bạn Thảo", role: "Sinh viên thiết kế", kind: 'resident',
        genderIndex: 1, x: 1420, y: 755, dir: -1, speed: 0.88, shirt: "#e5a93c", shadow: "#b07d22", shorts: "#3d352e", accessory: "none",
        wantedRecipeIdx: 0, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 80, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'tra_cam_sa', dialogueIndex: 0,
        dialogues: [
            "Trà Đào Cam Sả ở đây thơm xỉu luôn á, uống xong có mood vẽ bài liền!",
            "Sau này quán đông khách nhớ giữ giá sinh viên cho tụi mình nha!"
        ]
    }
];

// Dáng ngang, chiều cao, tóc, màu tóc, nước da và chi tiết nhận diện.
const npcLooks = {
    be_ut:          [0.90, 0.95, 'braid', '#392521', 1, 'vine', 'ribbon', '#e7ac49', '#b57441'],
    anh_hung:       [1.20, 1.10, 'crop', '#292224', 2, 'beard', 'rolled', '#3c7691', '#284e65'],
    phuong_vy:      [0.95, 1.02, 'bun', '#623b2a', 0, 'pearl', 'baker', '#f2dfc7', '#bd8275'],
    duc_anh:        [0.88, 1.12, 'sweep', '#33272a', 0, 'book', 'cardigan', '#768a69', '#465840'],
    bao_ngoc:       [0.93, 1.12, 'bob', '#29232c', 0, 'pin', 'blazer', '#43516c', '#292f46'],
    sep_hoang:      [1.14, 1.17, 'slick', '#25262e', 1, 'tie', 'suit', '#39435d', '#232838'],
    thao_nhi:       [0.91, 0.98, 'long', '#64392d', 0, 'satchel', 'dress', '#6e9f96', '#3b786f'],
    nhiep_anh_lam:  [1.05, 1.14, 'wave', '#352821', 2, 'camera', 'utility', '#716653', '#484735'],
    ky_duyen:       [0.91, 1.10, 'wave', '#752e38', 0, 'mic', 'stage', '#b95178', '#733054'],
    dj_ken:         [1.08, 1.04, 'spike', '#473152', 1, 'headphones', 'dj', '#743faf', '#402264'],
    chu_tu:         [1.22, 1.02, 'crop', '#73706c', 2, 'moustache', 'plain', '#62706e', '#3b4b4a'],
    my_linh:        [1.00, 0.96, 'ponytail', '#693d2a', 1, 'bag', 'dress', '#cd7c91', '#8b415e'],
    anh_phuc:       [1.27, 1.06, 'crop', '#292429', 2, 'overalls', 'work', '#4c6872', '#384751'],
    co_mai:         [1.05, 1.00, 'bun', '#57352c', 1, 'flower', 'dress', '#a05073', '#63334d'],
    bao_nam:        [1.02, 1.20, 'sweep', '#42372f', 1, 'none', 'plain', '#768783', '#4a5d5a'],
    ong_khai:       [1.24, 1.15, 'slick', '#68646b', 1, 'pin', 'suit', '#56505e', '#322d3a'],
    ha_vy:          [0.86, 1.15, 'long', '#985031', 0, 'bag', 'dress', '#bf876b', '#87533e'],
    minh_khoa:      [0.98, 1.07, 'wave', '#5b3a2b', 1, 'camera', 'plain', '#776754', '#504233'],
    lan_chi:        [0.88, 1.00, 'bob', '#673246', 1, 'earrings', 'blazer', '#a06b82', '#70465a'],
    quoc_huy:      [1.12, 1.02, 'spike', '#3c3030', 2, 'backpack', 'work', '#606b55', '#424935'],
    thu_trang:     [0.99, 1.07, 'bob', '#352923', 0, 'glasses', 'blazer', '#6f6a95', '#4c4667'],
    duc_tin:       [0.86, 1.15, 'spike', '#28232e', 0, 'glasses', 'plain', '#647185', '#424c60'],
    anh_thao:      [0.94, 1.04, 'sweep', '#403034', 1, 'pearl', 'dress', '#a75c66', '#773c4a'],
    bac_nam:       [1.17, 0.97, 'crop', '#82756d', 2, 'none', 'elder', '#777e61', '#53543d'],
    yen_nhi:       [0.85, 0.95, 'wave', '#ac6850', 0, 'bag', 'dress', '#659caa', '#447786'],
    mai_anh:       [1.10, 1.08, 'ponytail', '#423039', 1, 'earrings', 'blazer', '#746181', '#4c3e5a'],
    tuan_vu:       [1.15, 1.05, 'spike', '#2c2b3c', 2, 'none', 'plain', '#536473', '#3a4656'],
    ong_bay:       [0.95, 0.94, 'bald', '#b6a69c', 1, 'cane', 'elder', '#a39a7a', '#736750'],
    ba_sau:        [1.19, 0.93, 'bun', '#b2a099', 2, 'pearl', 'elder', '#9b7484', '#735263'],
    bac_son:       [1.04, 1.04, 'bald', '#9b9193', 1, 'cane', 'elder', '#738695', '#4d5d69'],
    co_huong:      [1.00, 1.10, 'long', '#625354', 0, 'brooch', 'elder', '#83677d', '#5b4758'],
    nhat_long:     [1.18, 1.09, 'sweep', '#47342e', 2, 'none', 'work', '#426e74', '#2d5055'],
    thao_vy:       [0.98, 1.06, 'braid', '#584033', 1, 'backpack', 'dress', '#6c91a3', '#46697a'],
    chi_man:       [1.15, 0.99, 'ponytail', '#362827', 2, 'none', 'baker', '#a26c5f', '#734a40'],
    gia_bao:       [1.05, 1.18, 'slick', '#694733', 2, 'camera', 'plain', '#7a806c', '#525944'],
    bac_si_tuan:   [1.06, 1.12, 'crop', '#292429', 0, 'glasses', 'plain', '#ffffff', '#cfd8dc'],
    y_ta_ngoc_han: [0.92, 1.02, 'bun', '#4e2f24', 0, 'ribbon', 'dress', '#80deea', '#4fb3bf']
};

// Nhân vật cốt truyện và cư dân có tên
let storyNPCs = (GAME_CONFIG.NPCS || []).map((n, idx) => ({
    ...n,
    look: npcLooks[n.id],
    animFrame: 0,
    animTimer: 0,
    dialogueIndex: 0,
    friendship: 0,
    talkedToday: false,
    giftedToday: false,
    birthday: 2 + (idx * 23) % 99,
    lovedDrink: GAME_CONFIG.RECIPES[idx % GAME_CONFIG.RECIPES.length].id
}));

// Khoảng ngày trong năm game và khu tổ chức từng lễ hội.
const festivalDefinitions = [
    ['Tết Nguyên Đán', 3, 8, 'Canh nhịp lô tô'],
    ['Hội hoa xuân', 10, 16, 'Xếp hoa đúng nhịp'],
    ['Hội bánh mì Sài Gòn', 19, 24, 'Chuyền giỏ bánh mì'],
    ['Lễ 30/4', 29, 34, 'Đua tiếp sức'],
    ['Hội sách đường phố', 39, 46, 'Chuyền sách'],
    ['Ngày hội thả diều', 51, 57, 'Đón gió thả diều'],
    ['Quốc khánh 2/9', 64, 69, 'Gõ nhịp trống'],
    ['Tết Trung Thu', 70, 76, 'Đánh trống Trung Thu'],
    ['Hội cà phê Sài Gòn', 81, 88, 'Canh nhịp pha phin'],
    ['Noel', 93, 98, 'Chuyền hộp quà']
];

function rollYearFestivals() {
    return festivalDefinitions.map(([name, first, last, game]) => ({
        name, game, zone: 'PARK', day: first + Math.floor(Math.random() * (last - first + 1))
    }));
}

let yearFestivals = rollYearFestivals();

function getTodayFestival() {
    return yearFestivals.find((event) => event.day === playerStats.dayOfYear);
}

function getFestivalAttendees(festival) {
    if (!festival) return [];
    const start = festivalDefinitions.findIndex(([name]) => name === festival.name) * 4;
    return Array.from({ length: 5 }, (_, index) => storyNPCs[(start + index) % storyNPCs.length]);
}

function openWallCalendar() {
    closeAllModals();
    selectedCalendarDay = playerStats.dayOfYear;
    showWallCalendar = true;
}

// Bốn điểm hẹn trên vỉa hè hai bên đường chính của mỗi khu.
const npcMeetingSpots = [
    { label: 'Tây Bắc', x: 130, y: 455 },
    { label: 'Đông Bắc', x: 1195, y: 455 },
    { label: 'Đông Nam', x: 1195, y: 713 },
    { label: 'Tây Nam', x: 130, y: 713 }
];
const festivalMeetingSpots = Array.from({ length: 5 }, (_, index) => ({
    label: 'Quảng trường', x: 730 + index * 128, y: 555
}));
const npcScheduleStartHours = [
    [5, 11, 17],
    [5, 10, 16],
    [5, 12, 18],
    [5, 9, 15]
];
const SAIGON_ZONES = Object.keys(GAME_CONFIG.ZONES).filter((z) => !/^(DALAT|MEKONG|VUNGTAU)_/.test(z));
const npcScheduleZones = SAIGON_ZONES;
const npcRosters = Object.fromEntries(npcScheduleZones.map((zone) => [
    zone, storyNPCs.filter((npc) => npc.zone === zone)
]));

function getNPCSchedulePhase() {
    return Math.floor((playerStats.dayOfYear - 1) / 25);
}

let cityReputation = 0;
let chapterProgress = { year: 0, phase: -1, value: 0, completed: false };
const chapterGoals = [
    { action: 'sales', target: 4, title: 'Phục vụ 4 khách', reward: 4 },
    { action: 'talks', target: 3, title: 'Làm quen với 3 người trong khu phố', reward: 6 },
    { action: 'regulars', target: 3, title: 'Phục vụ 3 đơn khách quen', reward: 8 },
    { action: 'rental', target: 1, title: 'Thuê và mở một mặt bằng kinh doanh', reward: 10 }
];

function getCurrentChapterGoal() {
    return chapterGoals[getNPCSchedulePhase()];
}

function ensureChapterProgress(showNotice = false) {
    const phase = getNPCSchedulePhase();
    if (chapterProgress.year === playerStats.year && chapterProgress.phase === phase) return;
    const hadProgress = chapterProgress.year !== 0;
    const goal = chapterGoals[phase];
    chapterProgress = { year: playerStats.year, phase, value: 0, completed: false };
    if (goal.action === 'rental' && Object.keys(rentedProperties).length > 0) {
        chapterProgress.value = goal.target;
        chapterProgress.completed = true;
    }
    if (showNotice || hadProgress) {
        showToast(`Chặng ${phase + 1}/4 · Mục tiêu: ${goal.title}`);
    }
}

function addCityReputation(amount) {
    const before = cityReputation;
    cityReputation = Math.max(0, Math.min(100, cityReputation + amount));
    if (amount > 0) {
        const unlocks = [
            ['Khu Phố Đắt Hơn', 8], ['Khu Đón Gió', 15], ['Khu Người Già', 22],
            ['Khu Văn Phòng', 30], ['Trung Tâm Sầm Uất', 45], ['Quận 1', 60]
        ];
        const unlocked = unlocks.filter(([, threshold]) => before < threshold && cityReputation >= threshold).pop();
        if (unlocked) {
            GameAudio?.playUnlock();
            showToast(`Danh tiếng ${cityReputation}/100 · Đủ điều kiện thuê mặt bằng tại ${unlocked[0]}!`);
        }
        checkRecipeUnlockQuests();
    }
}

function checkNPCFriendshipMilestone(npc) {
    if (!npc) return;
    if (!npc.repMilestoneClaimed && (npc.friendship || 0) >= 100) {
        npc.repMilestoneClaimed = true;
        addCityReputation(2);
        addScreenPopup(500, 428, `🤝 Bạn thân ${npc.name}: +2 Danh tiếng!`, "#f0b643");
    }
    const sig = SIGNATURE_RECIPES.find((r) => r.mentorId === npc.id);
    if (sig && !unlockedSignatures.has(sig.id) && (npc.friendship || 0) >= sig.reqFriendship) {
        unlockedSignatures.add(sig.id);
        addCityReputation(2);
        GameAudio?.playUnlock();
        addScreenPopup(500, 396, `✨ Học món Signature: ${sig.icon} ${sig.name}!`, "#f0b643");
        showToast(`✨ ${npc.name} vừa truyền dạy món Signature [${sig.icon} ${sig.name}] (+2 Danh tiếng)!`, 320);
    }
}

function recordChapterAction(action, amount = 1) {
    ensureChapterProgress();
    const goal = getCurrentChapterGoal();
    if (chapterProgress.completed || goal.action !== action) return;
    chapterProgress.value = Math.min(goal.target, chapterProgress.value + amount);
    if (chapterProgress.value >= goal.target) {
        chapterProgress.completed = true;
        addCityReputation(goal.reward);
        GameAudio?.playUnlock();
        showToast(`Hoàn thành mục tiêu chặng ${chapterProgress.phase + 1} · +${goal.reward} danh tiếng thành phố!`);
    }
}

function getRentalReputationRequirement(rental, zone = currentZone) {
    const thresholds = {
        HOME_STREET: 0, BETTER_STREET: 8, BREEZE_AREA: 15,
        ELDERLY_AREA: 22, OFFICE_DISTRICT: 30, DOWNTOWN: 45, DISTRICT_1: 60
    };
    const base = thresholds[zone] ?? 0;
    return base + (rental?.price >= 28000000 ? 3 : 0);
}

// Mỗi giai đoạn: hai chuyến ghé khu khác rồi về khu nhà.
const npcVisitOffsets = [[1, 3, 0], [2, 5, 0], [3, 6, 0], [4, 7, 0]];

function getNPCSchedule(homeZone, rosterIndex) {
    const festival = getTodayFestival();
    const npc = npcRosters[homeZone][rosterIndex];
    const attendee = getFestivalAttendees(festival).indexOf(npc);
    if (attendee >= 0) {
        const homeSpot = npcMeetingSpots[rosterIndex % npcMeetingSpots.length];
        return [
            { start: 5, end: 9, zone: homeZone, spot: homeSpot },
            { start: 9, end: 21, zone: 'PARK', spot: festivalMeetingSpots[attendee] },
            { start: 21, end: 24, zone: homeZone, spot: homeSpot }
        ];
    }

    const phase = getNPCSchedulePhase();
    const startHours = npcScheduleStartHours[phase];
    const homeIndex = npcScheduleZones.indexOf(homeZone);
    const schedule = startHours.map((start, index) => ({
        start,
        zone: npcScheduleZones[(homeIndex + npcVisitOffsets[phase][index]) % npcScheduleZones.length],
        end: startHours[index + 1] ?? GAME_CONFIG.TIME.SLEEP_PENALTY_LIMIT,
        spot: npcMeetingSpots[(rosterIndex + phase + index) % npcMeetingSpots.length]
    }));
    const rawAppt = shopAppointments[npc.id];
    if (!rawAppt) return schedule;
    const appts = Array.isArray(rawAppt[0]) ? rawAppt : [rawAppt];
    let result = schedule;
    for (const [zone, name, start, end] of appts) {
        const shop = shopsByZone[zone]?.find((entry) => entry.name.includes(name));
        if (!shop) continue;
        const next = [];
        for (const slot of result) {
            if (slot.end <= start || slot.start >= end) {
                next.push(slot);
            } else {
                if (slot.start < start) next.push({ ...slot, end: start });
                if (slot.end > end) next.push({ ...slot, start: end });
            }
        }
        next.push({ start, end, zone, shop, spot: { x: shop.x, y: shop.y, label: name } });
        result = next.sort((a, b) => a.start - b.start);
    }
    return result;
}

function toggleNPCSchedule() {
    if (showHandbookModal && handbookTab === 'schedule') {
        closeAllModals();
        GameAudio?.playModalClose();
        return;
    }
    closeAllModals();
    handbookTab = 'schedule';
    showHandbookModal = true;
    scheduleZone = currentGameState === GAME_STATES.PLAYING_HOME ? 'HOME_STREET' : (currentZone || 'HOME_STREET');
    GameAudio?.playModalOpen();
}

// ============================================================================
// HỆ THỐNG MA TRẬN ĐIỂM ẢNH NHÂN VẬT (24x35 PIXEL ART BITMAP)
// ============================================================================

const SPRITE_DOWN_IDLE = [
    "........OOOOOOOO........",
    "......OOhhhhhhhhOO......",
    ".....OhHHHHHHHHHHhO.....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHSSOSSSOSSHHO....",
    "....OHHSSSSSSSSSSHHO....",
    "...OOsSSEESSSSEESSsOO...",
    "...OOsSSSSSSSSSSSSsOO...",
    "...OOsSSEESSSSEESSsOO...",
    "....OOSSSSSSSSSSSSOO....",
    ".....OSSSSSMMSSSSSO.....",
    "......OOSSSSSSSSOO......",
    "........OOsSSsOO........",
    "......OOOTTTTTTOOO......",
    ".....OTTTTTTTTTTTTO.....",
    "....OTTTTTTTTTTTTTTO....",
    "....OTTTOTTTTTTOTTTO....",
    "...OOsSOOTTTTTTOOSsOO...",
    "...OOSsOOTTTTTTOOsSOO...",
    "...OOSsOOTTTTTtOOsSOO...",
    "...OOSSOOTtttttoOSSOO...",
    "....OOOOOOOOOOOOOOOO....",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    "......OPPPPppPPPPO......",
    "......OPPPPOOPPPPO......",
    "......OOOOO..OOOOO......",
    ".......OSSO..OSSO.......",
    ".......OSSO..OSSO.......",
    ".......OssO..OssO.......",
    "......OOKKOO.OOKKOO.....",
    ".....OOKKKKOOOKKKKOO....",
    ".....OkkkkkkkkkkkkkO....",
    "......OOOOOOOOOOOOO....."
];

const SPRITE_DOWN_WALK1 = [
    "........OOOOOOOO........",
    "......OOhhhhhhhhOO......",
    ".....OhHHHHHHHHHHhO.....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHSSOSSSOSSHHO....",
    "....OHHSSSSSSSSSSHHO....",
    "...OOsSSEESSSSEESSsOO...",
    "...OOsSSSSSSSSSSSSsOO...",
    "...OOsSSEESSSSEESSsOO...",
    "....OOSSSSSSSSSSSSOO....",
    ".....OSSSSSMMSSSSSO.....",
    "......OOSSSSSSSSOO......",
    "........OOsSSsOO........",
    "......OOOTTTTTTOOO......",
    ".....OTTTTTTTTTTTTO.....",
    "....OTTTTTTTTTTTTTTO....",
    "...OOTTTOTTTTTTOTTTO....",
    "...OOSsOOTTTTTTOOSsOO...",
    "...OOSSOOTTTTTTOOsSOO...",
    "....OOOOOTTTTTtOOsSOO...",
    "........OTtttttoOSSOO...",
    "........OOOOOOOOOOOO....",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    "......OPPPPppPPPPO......",
    "......OPPPPOOPPPPO......",
    "......OSSO....OOOOO.....",
    "......OSSO.....OSSO.....",
    "......OssO.....OSSO.....",
    ".....OOKKOO....OssO.....",
    "....OOKKKKOO..OOKKOO....",
    "....OkkkkkkO.OOKKKKOO...",
    ".....OOOOOO..OkkkkkkO...",
    "..............OOOOOO...."
];

const SPRITE_DOWN_WALK2 = [
    "........OOOOOOOO........",
    "......OOhhhhhhhhOO......",
    ".....OhHHHHHHHHHHhO.....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHSSOSSSOSSHHO....",
    "....OHHSSSSSSSSSSHHO....",
    "...OOsSSEESSSSEESSsOO...",
    "...OOsSSSSSSSSSSSSsOO...",
    "...OOsSSEESSSSEESSsOO...",
    "....OOSSSSSSSSSSSSOO....",
    ".....OSSSSSMMSSSSSO.....",
    "......OOSSSSSSSSOO......",
    "........OOsSSsOO........",
    "......OOOTTTTTTOOO......",
    ".....OTTTTTTTTTTTTO.....",
    "....OTTTTTTTTTTTTTTO....",
    "....OTTTOTTTTTTOTTTOO...",
    "...OOsSOOTTTTTTOOsSOO...",
    "...OOSsOOTTTTTTOOSSO....",
    "...OOSsOOTTTTTtOOOO.....",
    "...OOSSOOTttttto........",
    "....OOOOOOOOOOOO........",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    "......OPPPPppPPPPO......",
    "......OPPPPOOPPPPO......",
    ".....OOOOO....OSSO......",
    ".....OSSO.....OSSO......",
    ".....OSSO.....OssO......",
    ".....OssO....OOKKOO.....",
    "....OOKKOO..OOKKKKOO....",
    "...OOKKKKOO.OkkkkkkO....",
    "...OkkkkkkO..OOOOOO.....",
    "....OOOOOO.............."
];

const SPRITE_UP_IDLE = [
    "........OOOOOOOO........",
    "......OOhhhhhhhhOO......",
    ".....OhHHHHHHHHHHhO.....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "....OHHHHHHHHHHHHHHO....",
    "...OOsHHHHHHHHHHHHsOO...",
    "...OOsHHHHHHHHHHHHsOO...",
    "...OOsHHHHHHHHHHHHsOO...",
    "....OOHHHHHHHHHHHHOO....",
    ".....OOHHHHHHHHHHOO.....",
    "......OOssssssssOO......",
    "........OOssssOO........",
    "......OOOTTTTTTOOO......",
    ".....OTTTTTTTTTTTTO.....",
    "....OTTTTTTTTTTTTTTO....",
    "....OTTTOTTTTTTOTTTO....",
    "...OOsSOOTTTTTTOOSsOO...",
    "...OOSsOOTTTTTTOOsSOO...",
    "...OOSsOOTtttttoOsSOO...",
    "...OOSSOOTtttttoOSSOO...",
    "....OOOOOOOOOOOOOOOO....",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    "......OPPPPppPPPPO......",
    "......OPPPPOOPPPPO......",
    "......OOOOO..OOOOO......",
    ".......OssO..OssO.......",
    ".......OssO..OssO.......",
    ".......OssO..OssO.......",
    "......OOKKOO.OOKKOO.....",
    ".....OOKKKKOOOKKKKOO....",
    ".....OkkkkkkkkkkkkkO....",
    "......OOOOOOOOOOOOO....."
];

const SPRITE_SIDE_IDLE = [
    ".......OOOOOOOO.........",
    ".....OOhhhhhhhhOO.......",
    "....OhHHHHHHHHHHhO......",
    "...OHHHHHHHHHHHHHHO.....",
    "...OHHHHHHHHHHHHHHO.....",
    "...OHHHHHHHHSSSSSHO.....",
    "...OHHHHHHHSSSSSSSO.....",
    "...OHHHHHsSSSSSEESSO....",
    "....OHHHsSSSSSSSSSSO....",
    "....OHHHsSSSSSSEESSO....",
    ".....OOHSSSSSSSSSSSO....",
    "......OOSSSSSMMMMOO.....",
    ".......OOSSSSSSSO.......",
    "........OOsSSsOO........",
    "......OOOTTTTTTO........",
    ".....OTTTTTTTTTTO.......",
    "....OTTTTTTTTTTTTO......",
    "....OTTTTOOTTTTTTO......",
    "....OTTTTOOsSOOTTTO.....",
    "....OTTTTOOSsOOTTTO.....",
    "....OTtttOOSsOOTttO.....",
    ".....OtttOOSSOOtttO.....",
    "......OOOOOOOOOOOO......",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    "......OPPPPPPPPPPO......",
    ".......OPPPOOPPPO.......",
    ".......OOOO..OOOO.......",
    ".......OSSO..OSSO.......",
    ".......OSSO..OSSO.......",
    ".......OssO..OssO.......",
    "......OOKKOOOOKKOO......",
    "......OOKKKKOOKKKKOO....",
    "......OkkkkkOkkkkkkO....",
    ".......OOOOOOOOOOOO....."
];

const SPRITE_SIDE_WALK1 = [
    ".......OOOOOOOO.........",
    ".....OOhhhhhhhhOO.......",
    "....OhHHHHHHHHHHhO......",
    "...OHHHHHHHHHHHHHHO.....",
    "...OHHHHHHHHHHHHHHO.....",
    "...OHHHHHHHHSSSSSHO.....",
    "...OHHHHHHHSSSSSSSO.....",
    "...OHHHHHsSSSSSEESSO....",
    "....OHHHsSSSSSSSSSSO....",
    "....OHHHsSSSSSSEESSO....",
    ".....OOHSSSSSSSSSSSO....",
    "......OOSSSSSMMMMOO.....",
    ".......OOSSSSSSSO.......",
    "........OOsSSsOO........",
    "......OOOTTTTTTO........",
    ".....OTTTTTTTTTTO.......",
    "....OTTTTTTTTTTTTO......",
    "....OTTTTTTTTTTTTO......",
    "....OTTTTTTOOTTTTTO.....",
    "....OTTTTTTOOsSOOTTO....",
    "....OTtttttoOSsOOTTO....",
    ".....OtttttoOSSOOOMO....",
    "......OOOOOOOOOOOO......",
    "......OOPPPPPPPPOO......",
    "......OPPPPPPPPPPO......",
    ".....OOPPPPPPPPPPOO.....",
    ".....OPPPO....OPPPO.....",
    ".....OSSO......OOOO.....",
    ".....OSSO......OSSO.....",
    "....OOKKOO.....OSSO.....",
    "....OOKKKKOO...OssO.....",
    "....OkkkkkkO..OOKKOO....",
    ".....OOOOOO...OOKKKKOO..",
    "..............OkkkkkkO..",
    "...............OOOOOO..."
];

function drawNPCBackHair(shape, color, flipX, y) {
    const lock = (x, top, w, h) => {
        const left = flipX ? 24 - x - w : x;
        pRect(ctx, left, top + y, w, h, '#261914');
        pRect(ctx, left + 1, top + y + 1, w - 2, h - 2, color);
    };
    if (shape === 'long' || shape === 'bob') {
        const height = shape === 'long' ? 17 : 9;
        lock(3, 7, 5, height);
        lock(16, 7, 5, height);
    } else if (shape === 'braid' || shape === 'ponytail') {
        lock(17, 7, 6, 13);
        lock(19, 17, 4, shape === 'braid' ? 9 : 4);
    } else if (shape === 'bun') lock(8, -4, 8, 7);
    else if (shape === 'spike') {
        lock(7, -2, 4, 7);
        lock(11, -4, 4, 8);
        lock(15, -1, 4, 6);
    } else if (shape === 'wave') {
        lock(3, 1, 7, 9);
        lock(15, 2, 7, 10);
    }
}

function drawNPCDetails(shape, hair, detail, dir, y) {
    const pixel = (x, top, w, h, color) => pRect(ctx, x, top + y, w, h, color);
    const front = dir !== 'up';
    if (shape === 'sweep') pixel(dir === 'left' ? 5 : 13, 4, 6, 3, hair);
    if (shape === 'slick') pixel(8, 3, 10, 1, '#af9b85');
    if (detail === 'vine') {
        pixel(16, 6, 4, 2, '#f4b550');
        pixel(19, 21, 2, 2, '#f4b550');
    } else if (detail === 'cane') {
        pixel(20, 23, 2, 11, '#634537');
        pixel(18, 23, 4, 2, '#d0a469');
    } else if (front && detail === 'mic') {
        pixel(18, 16, 3, 8, '#412d47');
        pixel(17, 15, 5, 4, '#e798ba');
        pixel(6, 13, 2, 3, '#ffd480');
    } else if (front && ['book', 'satchel'].includes(detail)) {
        pixel(15, 22, 6, 7, '#74434b');
        pixel(16, 23, 4, 4, '#eacc90');
        if (detail === 'book') pixel(6, 10, 12, 1, '#43333d');
    } else if (front && ['pin', 'pearl', 'brooch'].includes(detail)) {
        pixel(15, 18, 3, 2, '#f5cf83');
        if (detail === 'pearl') pixel(10, 16, 4, 1, '#fff2cf');
    }
    if (detail === 'headphones') {
        pixel(4, 8, 3, 7, '#46536a');
        pixel(17, 8, 3, 7, '#46536a');
        pixel(5, 9, 2, 4, '#f08b77');
        pixel(17, 9, 2, 4, '#f08b77');
    } else if (front && detail === 'glasses') {
        pixel(6, 9, 12, 1, '#30242c');
        pixel(6, 10, 5, 3, '#675760');
        pixel(13, 10, 5, 3, '#675760');
        pixel(7, 10, 3, 2, '#b9d6d3');
        pixel(14, 10, 3, 2, '#b9d6d3');
    } else if (front && (detail === 'beard' || detail === 'moustache')) {
        pixel(8, 13, 8, detail === 'beard' ? 4 : 2, hair);
    } else if (detail === 'flower' || detail === 'earrings') {
        pixel(17, detail === 'flower' ? 4 : 13, 3, 3, '#ffc16d');
    } else if (detail === 'backpack' || detail === 'bag') {
        pixel(dir === 'right' ? 3 : 17, 17, 5, 9, '#865337');
    } else if (front && detail === 'camera') {
        pixel(10, 21, 8, 5, '#312d38');
        pixel(13, 22, 3, 3, '#93bbbc');
    } else if (detail === 'scarf' || detail === 'tie') {
        pixel(7, 16, 10, 2, '#e4ad62');
        pixel(11, 18, 3, 5, '#ca734f');
    } else if (front && (detail === 'apron' || detail === 'jacket' || detail === 'overalls')) {
        const color = detail === 'apron' ? '#e9c99f' : detail === 'jacket' ? '#cfad8d' : '#42627e';
        pixel(8, 17, 2, 8, color);
        pixel(14, 17, 2, 8, color);
        if (detail !== 'jacket') pixel(8, 22, 8, 5, color);
    }
}

function drawNPCClothes(style, color, shade, hair, dir, offset) {
    const pixel = (x, y, w, h, fill) => pRect(ctx, x, y + offset, w, h, fill);
    const front = dir !== 'up';
    const side = dir === 'left' || dir === 'right';
    if (['dress', 'stage', 'vine', 'baker', 'ribbon'].includes(style)) {
        pixel(6, 21, 12, 7, '#261914');
        pixel(style === 'stage' ? 3 : 4, 25, style === 'stage' ? 18 : 16, 5, '#261914');
        pixel(7, 21, 10, 7, shade);
        pixel(style === 'stage' ? 4 : 5, 26, style === 'stage' ? 16 : 14, 3, color);
        pixel(8, 29, 8, 1, shade);
        if (front) {
            pixel(8, 16, 8, 2, style === 'stage' ? '#f4b7c5' : '#f2d3a9');
            pixel(7, 22, 10, 2, style === 'stage' ? '#f3a15f' : shade);
        }
        if (style === 'baker' || style === 'ribbon') {
            pixel(8, 19, 8, 9, '#ead0a0');
            pixel(10, 24, 4, 2, '#b98266');
        }
        if (style === 'stage' && front) {
            pixel(6, 26, 2, 2, '#ffd480');
            pixel(16, 27, 2, 2, '#ffd480');
        }
    } else if (front && ['suit', 'blazer', 'cardigan', 'utility', 'dj'].includes(style)) {
        pixel(7, 17, 10, 10, shade);
        pixel(8, 17, 8, 9, color);
        if (style === 'dj') {
            pixel(5, 19, 3, 4, '#bc78d6');
            pixel(16, 19, 3, 4, '#bc78d6');
            pixel(9, 21, 6, 2, '#59d2ce');
        } else {
            pixel(9, 16, 6, 2, '#ead1a9');
            pixel(11, 18, 2, 8, style === 'suit' ? '#a96453' : shade);
        }
    } else if (front && style === 'rolled') {
        pixel(5, 20, 4, 2, '#92bdc3');
        pixel(15, 20, 4, 2, '#92bdc3');
    } else if (style === 'elder') {
        pixel(6, 23, 12, 5, shade);
        pixel(8, 22, 8, 4, color);
        if (front) {
            pixel(7, 12, 3, 1, '#85655c');
            pixel(14, 12, 3, 1, '#85655c');
            pixel(9, 14, 5, 1, '#9a7062');
            pixel(5, 7, 3, 1, hair);
        }
        if (side) pixel(6, 18, 4, 4, shade);
    } else if (front && ['plain', 'work'].includes(style)) {
        // Đường may, cổ áo và túi áo nhỏ tạo dáng riêng cho cư dân thường.
        pixel(8, 16, 8, 2, '#f1d8b3');
        pixel(10, 18, 4, 2, shade);
        pixel(11, 20, 1, 1, '#f4d28a');
        if (style === 'work') {
            pixel(7, 22, 4, 4, shade);
            pixel(8, 23, 2, 1, '#d8c39f');
            pixel(14, 22, 3, 2, '#f0c36d');
        }
    }
}

function drawChibiFace(dir, isFemale, hairShape) {
    if (dir === 'down') {
        // Mắt long lanh, má hồng và miệng nhỏ giúp khuôn mặt đọc rõ ở cỡ sprite 24x35.
        pRect(ctx, 8, 7, 2, 2, '#fff0d1');
        pRect(ctx, 15, 7, 2, 2, '#fff0d1');
        pRect(ctx, 9, 8, 1, 2, '#39252a');
        pRect(ctx, 16, 8, 1, 2, '#39252a');
        pRect(ctx, 8, 7, 1, 1, '#ffffff');
        pRect(ctx, 15, 7, 1, 1, '#ffffff');
        pRect(ctx, 11, 11, 2, 1, '#c78361');
        pRect(ctx, 11, 13, 3, 1, '#9d4e4c');
        if (isFemale || ['bun', 'long', 'braid', 'ponytail', 'bob', 'ribbon'].includes(hairShape)) {
            pRect(ctx, 5, 11, 2, 1, '#e98b82');
            pRect(ctx, 18, 11, 2, 1, '#e98b82');
            pRect(ctx, 7, 6, 3, 1, '#261914');
            pRect(ctx, 14, 6, 3, 1, '#261914');
        }
    } else if (dir === 'left' || dir === 'right') {
        const eyeX = dir === 'left' ? 7 : 14;
        pRect(ctx, eyeX, 8, 2, 2, '#fff0d1');
        pRect(ctx, eyeX + 1, 8, 1, 2, '#39252a');
        pRect(ctx, eyeX, 8, 1, 1, '#ffffff');
        if (isFemale) pRect(ctx, dir === 'left' ? 5 : 18, 11, 2, 1, '#e98b82');
    }
}

function drawBitmapCharacter(x, y, config, dir = 'down', animFrame = 0, isMoving = false, scale = 1.45, isSeated = false) {
    const outfit = config.outfits[config.outfitIndex];
    const featured = config.look && ['ribbon', 'baker', 'cardigan', 'blazer', 'suit', 'dress', 'utility', 'stage', 'dj'].includes(config.look[6]);
    const accType = featured ? 'none' : config.accessories[config.accessoryIndex].type;
    const isFemale = config.genderIndex === 1;
    const look = config.look;
    const [bodyWidth, bodyHeight, hairShape, hair, skin, detail, silhouette, clothes, clothesShade] = look || [];
    const skins = [['#ffd0a7', '#d9a17c'], ['#ecaa7f', '#bc7958'], ['#c98a62', '#9b5d44']];
    const [skinLight, skinShade] = skins[skin] || ['#f2b488', '#d99568'];

    const effectiveMoving = isSeated ? false : isMoving;
    let matrix = SPRITE_DOWN_IDLE;
    let flipX = false;

    if (dir === 'down') {
        if (effectiveMoving && animFrame === 1) matrix = SPRITE_DOWN_WALK1;
        else if (effectiveMoving && animFrame === 3) matrix = SPRITE_DOWN_WALK2;
        else matrix = SPRITE_DOWN_IDLE;
    } else if (dir === 'up') {
        matrix = SPRITE_UP_IDLE;
    } else if (dir === 'right') {
        matrix = (effectiveMoving && (animFrame === 1 || animFrame === 3)) ? SPRITE_SIDE_WALK1 : SPRITE_SIDE_IDLE;
    } else if (dir === 'left') {
        matrix = (effectiveMoving && (animFrame === 1 || animFrame === 3)) ? SPRITE_SIDE_WALK1 : SPRITE_SIDE_IDLE;
        flipX = true;
    }

    const colorMap = {
        'O': '#261914',
        'H': hair || (isFemale ? '#4a2818' : '#261d1a'),
        'h': hair || (isFemale ? '#6e3f28' : '#42332e'),
        'S': skinLight,
        's': skinShade,
        'E': '#1f1511',
        'M': '#96422c',
        'T': clothes || outfit.color,
        't': clothesShade || outfit.shadow,
        'P': outfit.shorts,
        'p': '#1e242b',
        'K': '#4a413b',
        'k': '#8c827a'
    };

    const bobY = (effectiveMoving && (animFrame === 1 || animFrame === 3)) ? -1 : 0;

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (scale !== 1) ctx.scale(scale, scale);
    if (isSeated) {
        ctx.beginPath();
        ctx.rect(-8, -12, 40, 41);
        ctx.clip();
    }
    if (look) {
        ctx.translate(12, 34);
        ctx.scale(bodyWidth, bodyHeight);
        ctx.translate(-12, -34);
        if (silhouette === 'elder') ctx.transform(1, 0, dir === 'left' ? 0.13 : dir === 'right' ? -0.13 : 0, 1, 0, 0);
        drawNPCBackHair(hairShape, hair, flipX, bobY);
    }

    if (!isSeated) pRect(ctx, 6, 33, 12, 4, "rgba(29, 25, 26, 0.16)");
    pRect(ctx, 4, 34, 16, 3, "rgba(29, 25, 26, 0.27)");
    pRect(ctx, 7, 35, 10, 2, "rgba(29, 25, 26, 0.14)");

    if (isFemale && !look) {
        pRect(ctx, 3, 9 + bobY, 18, 7, '#261914');
        pRect(ctx, 4, 10 + bobY, 16, 5, '#4a2818');
    }

    for (let r = 0; r < matrix.length; r++) {
        const rowStr = matrix[r];
        for (let c = 0; c < rowStr.length; c++) {
            const ch = rowStr[c];
            if (ch === '.') continue;
            const col = hairShape === 'bald' && (ch === 'H' || ch === 'h') && c >= 8 && c <= 15
                ? skinLight : colorMap[ch];
            if (!col) continue;
            const drawCol = flipX ? (23 - c) : c;
            let legShift = 0;
            if (dir === 'up' && effectiveMoving && r >= 27) {
                if (animFrame === 1 && c < 12) legShift = -2;
                if (animFrame === 3 && c >= 12) legShift = -2;
            }
            pRect(ctx, drawCol, r + bobY + legShift, 1, 1, col);
        }
    }

    if (dir !== 'up') drawChibiFace(dir, isFemale, hairShape);

    if (look) {
        drawNPCClothes(silhouette, clothes, clothesShade, hair, dir, bobY);
        drawNPCDetails(hairShape, hair, detail, dir, bobY);
        if (dir === 'down' && hairShape !== 'bald') {
            // Điểm bắt sáng trên tóc và trang sức nhỏ theo nét nhận diện từng NPC.
            pRect(ctx, 7, 3 + bobY, 3, 1, 'rgba(255, 224, 166, 0.72)');
            if (['wave', 'long', 'ponytail', 'braid'].includes(hairShape)) pRect(ctx, 4, 8 + bobY, 1, 5, 'rgba(255, 224, 166, 0.42)');
            if (['dress', 'stage', 'baker', 'ribbon'].includes(silhouette)) {
                pRect(ctx, 8, 28 + bobY, 8, 1, '#f4d28a');
            }
        }
    }
    if (outfit.cut) {
        const trim = outfit.cut === 'jacket' ? '#efe2bd' : outfit.shadow;
        pRect(ctx, 11, 17 + bobY, 2, outfit.cut === 'apron' ? 10 : 7, trim);
        pRect(ctx, 8, 23 + bobY, 8, 2, trim);
    }
    if (accType === "cap") {
        pRect(ctx, 6, 0 + bobY, 12, 1, '#261914');
        pRect(ctx, 5, 1 + bobY, 14, 4, '#261914');
        pRect(ctx, 6, 1 + bobY, 12, 3, '#c84b31');
        pRect(ctx, 8, 1 + bobY, 6, 1, '#e0674e');
        const visorX = (dir === 'left') ? 2 : (dir === 'right' ? 8 : 4);
        const visorW = (dir === 'left' || dir === 'right') ? 14 : 16;
        pRect(ctx, visorX, 4 + bobY, visorW, 3, '#261914');
        pRect(ctx, visorX + 1, 4 + bobY, visorW - 2, 2, '#963420');
    } else if (accType === "hat") {
        pRect(ctx, 6, -1 + bobY, 12, 2, '#261914');
        pRect(ctx, 5, 0 + bobY, 14, 4, '#261914');
        pRect(ctx, 6, 0 + bobY, 12, 3, '#7a9674');
        pRect(ctx, 2, 3 + bobY, 20, 3, '#261914');
        pRect(ctx, 3, 3 + bobY, 18, 2, '#5f7a61');
    }

    ctx.restore();
}

// ============================================================================
// HÀM TIỆN ÍCH VẼ BỐI CẢNH PIXEL ART & CÂY CỐI / SÂN VƯỜN STARDEW VALLEY
// ============================================================================

function pRect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pOutlinedRect(c, x, y, w, h, fillColor, outlineColor = PAL.OUTLINE) {
    pRect(c, x, y, w, h, outlineColor);
    pRect(c, x + 2, y + 2, w - 4, h - 4, fillColor);
}

const PLANT_BITMAP = [
    "........OOOO..........",
    "......OOLLLLOO..OOOO..",
    ".....OLLGGGGLLOOGLLLO.",
    "....OLGGGGGGGGGGGGGGLO",
    "..OOOLGGGGggGGGGGGGLO.",
    ".OLLLLGGGGggGGGGGGGO..",
    "OLGGGGGGGGggGGGgOOOO..",
    "OGGGGGgggGggGGggGLLLO.",
    ".OOOOOggdGggGggGGGGGLO",
    "..OOOGGGddggddGGGGGGGO",
    ".OLLGGGGddddddGGGggOO.",
    "OLGGGGGGddOOddGGggO...",
    "OGGGGgggOO..OOgggO....",
    ".OOOOddO......OOO.....",
    "....OdddO..OOdO.......",
    "...OOOOOOdOddOO.......",
    "..OCCCCCCOOOOCCO......",
    "..OCCCCCCCCCCCCO......",
    "..OggggggggggggO......",
    "...OPPPPPPPPPPO.......",
    "...OPPPPPPPPPpO.......",
    "...OPPPPPPPPppO.......",
    "....OPPPPPPPpO........",
    "....OPPPPPpppO........",
    ".....OppppppO.........",
    "......OOOOOO.........."
];

function drawTerracottaPlant(c, x, y, scale = 1.45) {
    const pal = {
        'O': '#261914',
        'L': '#85bf65',
        'G': '#599949',
        'g': '#3d7336',
        'd': '#264d23',
        'C': '#d97248',
        'P': '#b85d38',
        'p': '#8f4224'
    };
    const startX = Math.round(x - 11 * scale);
    const startY = Math.round(y - 22 * scale);
    pRect(c, startX + 3 * scale, startY + 24 * scale, 14 * scale, 3 * scale, "rgba(43, 29, 22, 0.35)");
    for (let r = 0; r < PLANT_BITMAP.length; r++) {
        const row = PLANT_BITMAP[r];
        for (let col = 0; col < row.length; col++) {
            const ch = row[col];
            if (ch === '.') continue;
            pRect(c, startX + col * scale, startY + r * scale, Math.ceil(scale), Math.ceil(scale), pal[ch]);
        }
    }
}

// Vẽ cây cổ thụ tán tròn xòe rộng kiểu Stardew Valley tạo bóng mát cho sân vườn
function drawShadeTree(c, x, y, scale = 1.0, blossomCol = null) {
    const s = scale;
    // Bóng râm lớn dưới gốc cây
    pRect(c, x - 34 * s, y + 6 * s, 68 * s, 18 * s, "rgba(43, 29, 22, 0.28)");
    pRect(c, x - 26 * s, y + 2 * s, 52 * s, 26 * s, "rgba(43, 29, 22, 0.22)");
    // Thân cây gỗ
    pOutlinedRect(c, x - 9 * s, y - 36 * s, 18 * s, 52 * s, "#7d4c27");
    pRect(c, x - 4 * s, y - 34 * s, 5 * s, 46 * s, "#9e6336");
    // Tán lá nhiều tầng
    pOutlinedRect(c, x - 42 * s, y - 78 * s, 84 * s, 48 * s, "#2e592c");
    pOutlinedRect(c, x - 36 * s, y - 96 * s, 72 * s, 52 * s, "#3d7336");
    pOutlinedRect(c, x - 28 * s, y - 108 * s, 56 * s, 42 * s, "#599949");
    pRect(c, x - 20 * s, y - 102 * s, 36 * s, 20 * s, "#7bb357");
    if (blossomCol) {
        [[-26, -72], [-8, -94], [14, -86], [22, -66], [-18, -56], [6, -62]].forEach(([bx, by]) => {
            pOutlinedRect(c, x + bx * s, y + by * s, 10 * s, 8 * s, blossomCol);
        });
    }
}

function drawParkBench(c, x, y) {
    pRect(c, x + 2, y + 18, 56, 6, "rgba(43, 29, 22, 0.32)");
    pOutlinedRect(c, x + 6, y + 12, 8, 12, "#3d352e");
    pOutlinedRect(c, x + 46, y + 12, 8, 12, "#3d352e");
    pOutlinedRect(c, x, y + 2, 60, 10, "#b87939");
    pOutlinedRect(c, x + 2, y - 8, 56, 10, "#c98842");
    pRect(c, x + 4, y - 4, 52, 2, "#6e4736");
}

function drawStreetLamp(c, x, y) {
    pRect(c, x - 6, y + 2, 16, 6, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, x - 3, y - 68, 10, 72, "#333942");
    pOutlinedRect(c, x - 11, y - 78, 26, 14, "#f0b643");
    pRect(c, x - 7, y - 74, 18, 6, "#fff8eb");
}

const SCOOTER_BITMAP = [
    "...................OO.......",
    "..................OmMO......",
    ".................OOOYO......",
    ".................OBBBO......",
    ".....OOOOOOOO...OwwwBO......",
    "....OSSSSSSSSO..OwwwBO......",
    "....OSSSSSSSSOO.OwwwBO......",
    "...OrBBBBBBBBsO.OwwwBO......",
    "..OBBBBBBBBBBBOOOwwwBO......",
    ".OBBBBBBBBBBBBBBBwwwBBBO....",
    ".OBBWWWWWWBBBBBBwwwWWWWWO...",
    ".OOWWrrrrWWBBBBwwwWWrrrWWO..",
    "..OWrOOOOrrRRRRRRRRrOOOrWO..",
    "..OWrO..OrRRRRRRRRRrO.OrWO..",
    "..OWrOOOOrrOOOOOOOOrOOOrWO..",
    "...OWWrrrWWO......OWWrrrWO..",
    "....OWWWWWO........OWWWWO...",
    ".....OOOOO..........OOOO...."
];

function drawParkedScooter(c, x, y, color, hasWhiteShield = true, scale = 1.55, flipX = false) {
    const pal = {
        'O': '#261914',
        'B': color,
        's': '#241a14',
        'S': '#2e3136',
        'w': hasWhiteShield ? '#f2eadc' : color,
        'W': '#222222',
        'r': '#b8bfc4',
        'R': '#8c9499',
        'Y': '#f5d76e',
        'm': '#95a5a6',
        'M': '#d4dbde'
    };
    pRect(c, x + 3, y + 24, 40, 6, "rgba(43, 29, 22, 0.38)");
    for (let r = 0; r < SCOOTER_BITMAP.length; r++) {
        const row = SCOOTER_BITMAP[r];
        for (let col = 0; col < row.length; col++) {
            const ch = row[col];
            if (ch === '.') continue;
            const drawCol = flipX ? (27 - col) : col;
            pRect(c, x + drawCol * scale, y + r * scale, Math.ceil(scale), Math.ceil(scale), pal[ch]);
        }
    }
}

function drawWeatheredWall(c, x, y, w, h, baseCol, darkCol, lightCol) {
    pOutlinedRect(c, x, y, w, h, baseCol);
    pRect(c, x + 2, y + 2, w - 4, 6, darkCol);
    pRect(c, x + 5, y + 10, Math.max(1, w - 10), 2, lightCol);
    pRect(c, x + 5, y + h - 13, Math.max(1, w - 10), 3, darkCol);
    pRect(c, x + 5, y + 11, 4, Math.max(1, h - 25), lightCol);
    pRect(c, x + w - 9, y + 11, 4, Math.max(1, h - 25), darkCol);
    for (let py = y + 8; py < y + h - 8; py += 12) {
        for (let px = x + 6; px < x + w - 12; px += 16) {
            const seed = (px * 17 + py * 31) % 19;
            if (seed === 0) {
                pRect(c, px, py, 10, 6, darkCol);
                pRect(c, px + 2, py + 6, 6, 3, darkCol);
            } else if (seed === 1 && lightCol) {
                pRect(c, px, py, 8, 4, lightCol);
            } else if (seed === 2) {
                pRect(c, px, py, 6, 3, "#a85538");
                pRect(c, px + 3, py + 4, 5, 2, "#8f4224");
            }
        }
    }
}

function drawTiledRoof(c, x, y, w, h, roofLight = PAL.ROOF_TILE_LIGHT, roofDark = PAL.ROOF_TILE_DARK) {
    pRect(c, x + 2, y + h, w - 2, 7, "rgba(43, 29, 22, 0.38)");
    pOutlinedRect(c, x, y, w, h, roofDark);
    pOutlinedRect(c, x - 2, y - 4, w + 4, 6, "#593728");
    for (let ry = y + 4; ry < y + h - 4; ry += 7) {
        const offset = ((ry / 7) % 2 === 0) ? 0 : 5;
        for (let rx = x + 3 + offset; rx < x + w - 8; rx += 10) {
            pRect(c, rx, ry, 8, 5, roofLight);
            pRect(c, rx + 1, ry + 5, 6, 2, "#4a2c1f");
        }
    }
    pRect(c, x + 4, y + 1, w - 8, 2, "rgba(245, 214, 165, 0.7)");
    for (let rx = x + 10; rx < x + w - 8; rx += 40) pRect(c, rx, y + h - 4, 2, 5, "#a66c4d");
}

function drawFoldingGate(c, x, y, w, h, gateColor = PAL.SHUTTER_GREEN, darkColor = PAL.SHUTTER_DARK) {
    pOutlinedRect(c, x, y, w, h, "#2b241f");
    pOutlinedRect(c, x + 2, y + 2, w - 4, h - 2, gateColor);
    for (let gx = x + 6; gx < x + w - 6; gx += 8) {
        pRect(c, gx, y + 4, 2, h - 6, darkColor);
        pRect(c, gx + 3, y + 4, 2, h - 6, PAL.OUTLINE);
        const mid1 = y + Math.floor(h * 0.32);
        const mid2 = y + Math.floor(h * 0.65);
        pRect(c, gx - 2, mid1, 5, 2, "#859e87");
        pRect(c, gx - 2, mid2, 5, 2, "#859e87");
    }
}

function drawStripedAwning(c, x, y, w, h, col1, col2) {
    pRect(c, x + 3, y + h + 2, w - 4, 8, "rgba(43, 29, 22, 0.32)");
    const stripeW = 12;
    for (let sx = x; sx < x + w; sx += stripeW) {
        const curW = Math.min(stripeW, x + w - sx);
        const isEven = Math.floor((sx - x) / stripeW) % 2 === 0;
        const mainCol = isEven ? col1 : col2;
        pRect(c, sx, y, curW, h - 4, PAL.OUTLINE);
        pRect(c, sx + 1, y + 2, curW - 1, h - 6, mainCol);
        pRect(c, sx + 1, y + h - 4, curW - 1, 5, PAL.OUTLINE);
        pRect(c, sx + 2, y + h - 4, Math.max(1, curW - 3), 3, mainCol);
    }
    pRect(c, x, y, 2, h, PAL.OUTLINE);
    pRect(c, x + w - 2, y, 2, h, PAL.OUTLINE);
}

function drawShutteredWindow(c, x, y, w, h, frameCol = "#8c5230", shutterCol = "#5f7a61") {
    pOutlinedRect(c, x - 3, y - 5, w + 6, 6, "#d9c2a3");
    pRect(c, x - 1, y + h + 2, w + 4, 4, "rgba(43, 29, 22, 0.3)");
    pOutlinedRect(c, x - 2, y + h - 2, w + 4, 6, "#c7b198");
    pOutlinedRect(c, x, y, w, h, "#2b1e18");
    pRect(c, x + 3, y + 3, w - 6, h - 6, "#77a3a3");
    pRect(c, x + 4, y + 4, w - 8, 3, "#c9e1d2");
    const halfW = Math.floor((w - 6) / 2);
    pOutlinedRect(c, x + 2, y + 2, halfW, h - 4, shutterCol);
    pOutlinedRect(c, x + 4 + halfW, y + 2, halfW, h - 4, shutterCol);
    for (let wy = y + 6; wy < y + h - 5; wy += 4) {
        pRect(c, x + 5, wy, halfW - 6, 2, frameCol);
        pRect(c, x + 7 + halfW, wy, halfW - 6, 2, frameCol);
    }
    pRect(c, x + Math.floor(w / 2) - 1, y + 1, 2, h - 2, frameCol);
}

function drawRentalStorefrontSign(c, x, y, w, title, subText, bgCol = PAL.SIGN_RED, borderCol = PAL.SIGN_YELLOW) {
    pRect(c, x + 4, y + 4, w, 46, "rgba(43, 29, 22, 0.38)");
    pOutlinedRect(c, x, y, w, 46, borderCol);
    pOutlinedRect(c, x + 4, y + 4, w - 8, 38, bgCol);
    c.fillStyle = "#fff6e5";
    c.font = "bold 13px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText(title, x + w / 2, y + 21);
    c.fillStyle = "#f0b643";
    c.font = "bold 11px 'Chakra Petch', sans-serif";
    c.fillText(subText, x + w / 2, y + 36);
}

// Vẽ một công trình độc lập (Freestanding Building) có bóng đổ, sân lát gạch phía trước và thêm vào danh sách vật cản
const zoneColliders = {};

function addCollider(zid, x, y, w, h) {
    if (!zoneColliders[zid]) zoneColliders[zid] = [];
    zoneColliders[zid].push({ x, y, w, h });
}

const marriageProfiles = {
    be_ut: [3500000, 2], anh_hung: [5000000, 2],
    phuong_vy: [8000000, 2], duc_anh: [6500000, 1],
    bao_ngoc: [10000000, 1], sep_hoang: [14000000, 1],
    thao_nhi: [3000000, 2], nhiep_anh_lam: [4500000, 2],
    ky_duyen: [7000000, 1], dj_ken: [9000000, 1],
    y_ta_ngoc_han: [4500000, 2], bac_si_tuan: [7500000, 1]
};
const engagementRingPrice = 3500000;
const weddingVenuePrice = 8000000;
const relationshipDaysRequired = 60;
let hasEngagementRing = false;
let engagedNPC = null;
let spouse = null;
let weddingDay = null;
let spouseBusinessFund = 0;

function canRomance(npc) {
    return Boolean(npc.romancePartnerId) && npc.genderIndex !== playerConfig.genderIndex;
}

function recordRelationshipDay(npc) {
    if (!canRomance(npc) || !npc.talkedToday || !npc.giftedToday ||
        npc.lastRelationshipDay === playerStats.day) return;
    npc.lastRelationshipDay = playerStats.day;
    npc.relationshipDays = Math.min(relationshipDaysRequired, (npc.relationshipDays || 0) + 1);
}

function relationshipAction(npc) {
    if (spouse === npc) return 'Đã kết hôn';
    if (spouse || (engagedNPC && engagedNPC !== npc) || !canRomance(npc)) return null;
    if (engagedNPC === npc) return weddingDay === null ? 'Thuê rạp · 8.000.000đ' : 'Hẹn ' + tailoringPickupDate(weddingDay);
    return (npc.relationshipDays || 0) >= relationshipDaysRequired ? 'Cầu hôn' : null;
}

function handleRelationshipAction(npc) {
    if (!relationshipAction(npc) || spouse) return;
    if (engagedNPC === npc) {
        if (weddingDay !== null) {
            showToast("Lễ cưới tại Công Viên lúc 09:00–21:00 · " + tailoringPickupDate(weddingDay));
            return;
        }
        if (playerStats.money < weddingVenuePrice) {
            showToast("Cần 8.000.000đ để thuê rạp cưới.");
            return;
        }
        playerStats.money -= weddingVenuePrice;
        weddingDay = playerStats.day + 2;
        while (Math.floor((weddingDay - 1) / GAME_CONFIG.TIME.DAYS_PER_YEAR) + 1 === playerStats.year &&
            yearFestivals.some((festival) => festival.day === (weddingDay - 1) % GAME_CONFIG.TIME.DAYS_PER_YEAR + 1)) {
            weddingDay++;
        }
        showToast("Đã thuê rạp ở Công Viên · " + tailoringPickupDate(weddingDay) + ", 09:00–21:00.");
        return;
    }
    if (!hasEngagementRing) {
        showToast("Mua nhẫn cầu hôn ở Tiệm Trang Sức tại Trung Tâm Sầm Uất.");
        return;
    }
    hasEngagementRing = false;
    engagedNPC = npc;
    showToast(npc.name + " đã đồng ý! Bấm Thuê rạp để đặt ngày cưới.");
}

function weddingAvailable() {
    return currentZone === 'PARK' && engagedNPC && weddingDay !== null &&
        playerStats.day >= weddingDay && playerStats.hour >= 9 && playerStats.hour < 21 &&
        !getTodayFestival();
}

function completeWedding() {
    if (!weddingAvailable()) return;
    spouse = engagedNPC;
    engagedNPC = null;
    weddingDay = null;
    closeAllModals();
    const [capital] = marriageProfiles[spouse.id];
    if (Object.keys(rentedProperties).length) {
        playerStats.money += capital;
        showToast(`💍 Đã cưới ${spouse.name}! Góp ${capital.toLocaleString('vi-VN')}đ vào quán.`, 300);
    } else {
        spouseBusinessFund = capital;
        showToast(`💍 Đã cưới ${spouse.name}! Phụ bán xe và dành ${capital.toLocaleString('vi-VN')}đ để thuê quán.`, 300);
    }
}

const shopMenus = [
    [/TIỆM TRANG SỨC/, [['Nhẫn cầu hôn', engagementRingPrice, 'engagement_ring']]],
    [/SHOWROOM/, showroomVehicles.map((vehicle) => [vehicle.name, vehicle.price, 'vehicle', vehicle])],
    [/QUÁN ĂN SÁNG/, [['Bánh mì ốp la', 25000, 'energy', 32], ['Xôi gà', 30000, 'energy', 42]]],
    [/SỬA XE/, [
        ['Siết lại bánh xe đẩy', 15000, 'repair', 1],
        ['Lắp Dù che nắng mưa', 900000, 'cart_umbrella', 1],
        ['Bộ Ghế ngồi tại chỗ', 1400000, 'cart_seating', 1]
    ]],
    [/CƠM TRƯA/, [['Cơm sườn', 40000, 'energy', 55], ['Cơm rau đậu', 32000, 'energy', 42]]],
    [/L’AMOUR|L'AMOUR/, [['Croissant bơ', 28000, 'energy', 32], ['Bánh bơ gói quà', 35000, 'gift', 1]]],
    [/TIỆM HOA/, [['Bó hoa giấy', 45000, 'gift', 1], ['Bó hoa lan', 75000, 'gift', 2]]],
    [/HIỆU SÁCH/, [['Tập truyện Sài Gòn', 55000, 'gift', 2]]],
    [/TIỆM ĐỒ CỔ/, [['Phin nhôm cổ', 85000, 'gift', 3]]],
    [/TIỆM TRÀ|TRÀ ĐẠO/, [['Trà sen nóng', 22000, 'energy', 24], ['Hộp trà sen', 50000, 'gift', 2]]],
    [/TIỆM GẠO/, [['Xôi đậu', 18000, 'energy', 26]]],
    [/HỦ TIẾU/, [['Hủ tiếu Nam Vang', 35000, 'energy', 45]]],
    [/TIỆM CÁ/, [['Bánh mì chả cá', 24000, 'energy', 31]]],
    [/TIỆM CHÈ/, [['Chè đậu xanh', 20000, 'energy', 27]]],
    [/CHỢ KÊNH|TẠP HÓA VEN KÊNH/, [['Hạt cà phê rang (5 phần)', 45000, 'coffee', 5], ['Trái cây (5 phần)', 50000, 'fruit', 5]]],
    [/QUÁN NƯỚNG/, [['Xiên nướng', 40000, 'energy', 42], ['Ba chỉ nướng sa tế', 55000, 'energy', 56]]],
    [/ỐC|LẨU/, [['Ốc xào sả', 45000, 'energy', 48], ['Lẩu chua hải sản', 70000, 'energy', 65]]],
    [/BIA SÂN THƯỢNG/, [['Đậu phộng rang', 22000, 'energy', 20]]],
    [/NEON|CLUB MƯA ĐÊM/, [['Soda tắc', 32000, 'energy', 26], ['Nước chanh bạc hà', 35000, 'energy', 30]]],
    [/TIỆM MAY/, [
        ['Sơ mi may đo màu chàm', 145000, 'outfit', { color: '#526a91', shadow: '#324360', shorts: '#b39a79', cut: 'shirt' }],
        ['Áo khoác may đo màu rêu', 195000, 'outfit', { color: '#64805c', shadow: '#3d5339', shorts: '#353738', cut: 'jacket' }],
        ['Tạp dề chủ quán màu nâu', 95000, 'outfit', { color: '#b37c56', shadow: '#63432e', shorts: '#414654', cut: 'apron' }]
    ]],
    [/SAIGON CHIC/, [
        ['Áo khoác Đêm Sài Gòn', 220000, 'outfit', { color: '#6b4f8c', shadow: '#42305a', shorts: '#283047' }],
        ['Sơ mi Hoa Sứ', 175000, 'outfit', { color: '#f3d6a3', shadow: '#bc925f', shorts: '#536b63' }]
    ]],
    [/BỆNH VIỆN/, [
        ['Truyền nước & Hồi sức (+100 ⚡)', 150000, 'energy', 100],
        ['Vitamin tổng hợp (+45 ⚡)', 65000, 'energy', 45]
    ]]
];
const shopAppointments = {
    // 35 nhân vật: ban ngày đi chợ/làm việc; buổi tối ~23 người đi tụ điểm đêm Q.1, ~12 người ở lại khu nhà nghỉ ngơi
    be_ut:         ['HOME_STREET', 'CÔ BA', 6, 9],
    anh_hung:      [['HOME_STREET', 'TIỆM SỬA XE', 8, 11], ['DISTRICT_1', 'BIA SÂN THƯỢNG', 18, 22]],
    phuong_vy:     ['BETTER_STREET', "L'AMOUR", 7, 11],
    duc_anh:       [['BETTER_STREET', 'HIỆU SÁCH', 10, 14], ['DISTRICT_1', 'SKYLINE', 21, 23]],
    bao_ngoc:      [['OFFICE_DISTRICT', 'VĂN PHÒNG', 9, 12], ['DISTRICT_1', 'SKYLINE', 21, 24]],
    sep_hoang:     [['OFFICE_DISTRICT', 'VIETBANK', 9, 12], ['DISTRICT_1', 'SKYLINE', 21, 24]],
    thao_nhi:      [['DOWNTOWN', 'SAIGON CHIC', 13, 16], ['DISTRICT_1', 'QUÁN NƯỚNG', 18, 21]],
    nhiep_anh_lam: [['DOWNTOWN', 'NHÀ SÁCH', 10, 13], ['DISTRICT_1', 'NEON MƯA ĐÊM', 20, 23]],
    ky_duyen:      [['DOWNTOWN', 'SAIGON CHIC', 15, 18], ['DISTRICT_1', 'SKYLINE', 21, 24]],
    dj_ken:        [['DOWNTOWN', 'TIỆM GIÀY', 14, 17], ['DISTRICT_1', 'NEON MƯA ĐÊM', 19, 24]],
    chu_tu:        ['CANAL_MARKET', 'TIỆM GẠO', 7, 10],
    my_linh:       [['HOME_STREET', 'QUÁN ĂN SÁNG', 6, 9], ['DISTRICT_1', 'QUÁN NƯỚNG', 18, 22]],
    anh_phuc:      [['HOME_STREET', 'TIỆM SỬA XE', 9, 13], ['DISTRICT_1', 'BIA SÂN THƯỢNG', 19, 23]],
    co_mai:        ['BETTER_STREET', 'TIỆM HOA', 8, 12],
    bao_nam:       [['DOWNTOWN', 'TIỆM MAY', 10, 14], ['DISTRICT_1', 'NEON MƯA ĐÊM', 20, 23]],
    ong_khai:      [['DOWNTOWN', 'SHOWROOM', 10, 14], ['DISTRICT_1', 'SKYLINE', 21, 23]],
    ha_vy:         [['DOWNTOWN', 'TIỆM TRANG SỨC', 13, 16], ['DISTRICT_1', 'SKYLINE', 21, 24]],
    minh_khoa:     [['OFFICE_DISTRICT', 'VĂN PHÒNG', 13, 16], ['DISTRICT_1', 'QUÁN NƯỚNG', 18, 22]],
    lan_chi:       [['DOWNTOWN', 'SAIGON CHIC', 11, 15], ['DISTRICT_1', 'NHÀ HÁT', 19, 22]],
    quoc_huy:      [['OFFICE_DISTRICT', 'CƠM TRƯA', 11, 14], ['DISTRICT_1', 'BIA SÂN THƯỢNG', 18, 22]],
    thu_trang:     [['OFFICE_DISTRICT', 'CƠM TRƯA', 11, 14], ['DISTRICT_1', 'ỐC & LẨU', 18, 21]],
    duc_tin:       [['OFFICE_DISTRICT', 'CƠM TRƯA', 12, 15], ['DISTRICT_1', 'QUÁN NƯỚNG', 19, 22]],
    anh_thao:      ['BETTER_STREET', "L'AMOUR", 14, 17],
    bac_nam:       [['ELDERLY_AREA', 'AN LẠC TRÀ ĐẠO', 8, 11], ['CANAL_MARKET', 'TIỆM CHÈ', 15, 17]],
    yen_nhi:       [['DOWNTOWN', 'TIỆM GIÀY', 14, 17], ['DISTRICT_1', 'NEON MƯA ĐÊM', 20, 24]],
    mai_anh:       [['OFFICE_DISTRICT', 'VIETBANK', 13, 16], ['DISTRICT_1', 'ỐC & LẨU', 18, 22]],
    tuan_vu:       [['DOWNTOWN', 'SHOWROOM', 14, 17], ['DISTRICT_1', 'NEON MƯA ĐÊM', 19, 23]],
    ong_bay:       [['ELDERLY_AREA', 'TIỆM TRÀ', 7, 11], ['ELDERLY_AREA', 'AN LẠC TRÀ ĐẠO', 14, 17]],
    ba_sau:        [['HOME_STREET', 'CÔ BA', 6, 9], ['ELDERLY_AREA', 'TIỆM TRÀ', 15, 18]],
    bac_son:       ['ELDERLY_AREA', 'TIỆM ĐỒ CỔ', 9, 12],
    co_huong:      [['ELDERLY_AREA', 'TIỆM ĐỒ CỔ', 10, 14], ['ELDERLY_AREA', 'TIỆM TRÀ', 16, 19]],
    nhat_long:     [['CANAL_MARKET', 'HỦ TIẾU', 7, 10], ['DISTRICT_1', 'ỐC & LẨU', 18, 22]],
    thao_vy:       ['BETTER_STREET', 'HIỆU SÁCH', 13, 16],
    chi_man:       ['CANAL_MARKET', 'TIỆM CÁ', 6, 10],
    gia_bao:       [['BREEZE_AREA', 'THUÊ XE ĐẠP', 15, 18], ['DISTRICT_1', 'NEON MƯA ĐÊM', 20, 23]],
    bac_si_tuan:   [['BETTER_STREET', 'BỆNH VIỆN', 7, 15], ['BETTER_STREET', "L'AMOUR", 15, 17], ['DISTRICT_1', 'NHÀ HÁT', 19, 22]],
    y_ta_ngoc_han: [['BETTER_STREET', 'BỆNH VIỆN', 7, 15], ['BETTER_STREET', 'TIỆM HOA', 15, 17], ['DOWNTOWN', 'SAIGON CHIC', 19, 22]]
};
const purchasedGifts = [];
let showShopMenu = false;
let outfitPreview = null;
const tailoringOrders = new Map();
const tailoringLeadTime = 3;

function tailoringPickupDate(readyDay) {
    const daysPerYear = GAME_CONFIG.TIME.DAYS_PER_YEAR;
    const day = (readyDay - 1) % daysPerYear + 1;
    const year = Math.floor((readyDay - 1) / daysPerYear) + 1;
    return `ngày ${day}, năm ${year}`;
}
let cartServiced = false;

function buyShopItem(item) {
    const [name, price, action, value] = item;
    if (!shopIsOpen(indoorShop)) return;
    if (action === 'engagement_ring' && (hasEngagementRing || engagedNPC || spouse)) {
        showToast("Mày đã có nhẫn hoặc đã đính hôn.");
        return;
    }
    if (action === 'vehicle' && ownedVehicles.has(value.id)) {
        showToast("Mày đã sở hữu xe này. Ra phố nhấn [V] để chạy.");
        return;
    }
    const isTailoring = action === 'outfit' && indoorShop.name.includes("TIỆM MAY");
    if (isTailoring && tailoringOrders.has(name)) {
        const readyDay = tailoringOrders.get(name);
        if (playerStats.day < readyDay) {
            showToast(`Đang may ${name} · Hẹn nhận ${tailoringPickupDate(readyDay)}.`);
            return;
        }
        tailoringOrders.delete(name);
        playerConfig.outfitIndex = playerConfig.outfits.push({ name, ...value }) - 1;
        outfitPreview = null;
        showToast("Đã nhận và mặc " + name);
        return;
    }
    if (action === 'outfit') {
        const owned = playerConfig.outfits.findIndex((outfit) => outfit.name === name);
        if (owned >= 0) {
            playerConfig.outfitIndex = owned;
            outfitPreview = null;
            showToast("Đã mặc " + name);
            return;
        }
        if (outfitPreview !== item) {
            outfitPreview = item;
            return;
        }
    }
    if (action === 'repair' && cartServiced) {
        showToast("Hôm nay xe đã được bảo dưỡng.");
        return;
    }
    if (action === 'cart_umbrella' && coffeeCart.umbrella) {
        showToast("Xe Cà Phê đã lắp Dù che nắng mưa rồi.");
        return;
    }
    if (action === 'cart_seating' && coffeeCart.seating) {
        showToast("Xe Cà Phê đã có Bộ Ghế ngồi tại chỗ rồi.");
        return;
    }
    if (playerStats.money < price) {
        showToast("Không đủ tiền.");
        return;
    }
    playerStats.money -= price;
    if (action === 'engagement_ring') {
        hasEngagementRing = true;
        showToast("Đã mua nhẫn. Có thể cầu hôn khi đủ 10 tim.");
        return;
    }
    if (isTailoring) {
        const readyDay = playerStats.day + tailoringLeadTime;
        tailoringOrders.set(name, readyDay);
        outfitPreview = null;
        showToast(`Đã đặt may ${name} · Hẹn nhận ${tailoringPickupDate(readyDay)}.`);
        return;
    }
    if (action === 'vehicle') {
        ownedVehicles.add(value.id);
        showToast("Đã mua " + name + " · Ra phố nhấn [V] để chạy.");
        return;
    }
    if (action === 'cart_umbrella') {
        coffeeCart.umbrella = true;
        showToast("☂️ Đã lắp Dù che cho Xe Cà Phê! Giảm sụt khách khi trời Mưa/Bão.");
        return;
    }
    if (action === 'cart_seating') {
        coffeeCart.seating = true;
        showToast("🪑 Đã thêm Ghế ngồi tại chỗ! Tăng lượt khách & +2.000đ mỗi ly tại xe.");
        return;
    }
    if (action === 'energy') playerStats.energy = Math.min(playerStats.maxEnergy, playerStats.energy + value);
    else if (action === 'gift') purchasedGifts.push({ name, points: 20 + value * 10 });
    else if (action === 'repair') cartServiced = true;
    else if (action === 'outfit') {
        playerConfig.outfitIndex = playerConfig.outfits.push({ name, ...value }) - 1;
        outfitPreview = null;
    } else addInventory(action, value);
    showToast("Đã mua " + name + (action === 'gift' ? " · Có thể tặng khi nói chuyện với NPC." :
        action === 'repair' ? " · Đẩy xe nhanh hơn hôm nay." : ""));
}

function giftShopItem() {
    const npc = activeDialogueNPC;
    if (!npc || npc.giftedToday || !purchasedGifts.length) return;
    const gift = purchasedGifts.shift();
    const points = gift.points * (npc.birthday === playerStats.dayOfYear ? 2 : 1);
    npc.friendship = (npc.friendship || 0) + points;
    checkNPCFriendshipMilestone(npc);
    npc.giftedToday = true;
    recordRelationshipDay(npc);
    recordDailyQuestProgress('gift_npc');
    showToast(`🎁 ${gift.name} cho ${npc.name} · +${points} thân thiết`);
}

function drawShopMenu() {
    drawStandardModalFrame({
        x: 255,
        y: 152,
        w: 490,
        h: 338,
        title: indoorShop.name,
        titleSize: 17,
        closeButton: false
    });
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    indoorShop.menu.forEach((item, index) => {
        const [name, price, action, value] = item;
        const y = 218 + index * 54;
        pOutlinedRect(ctx, 280, y, 440, 45, "#fff3d6");
        const owned = action === 'outfit' && playerConfig.outfits.some((outfit) => outfit.name === name);
        const vehicleOwned = action === 'vehicle' && ownedVehicles.has(value.id);
        const cartUpgradeOwned = (action === 'cart_umbrella' && coffeeCart.umbrella) || (action === 'cart_seating' && coffeeCart.seating);
        const priceLabel = price.toLocaleString('vi-VN') + "đ";
        const readyDay = indoorShop.name.includes("TIỆM MAY") ? tailoringOrders.get(name) : undefined;
        const detail = readyDay !== undefined
            ? (playerStats.day >= readyDay ? "Nhận đồ" : "Hẹn " + tailoringPickupDate(readyDay))
            : cartUpgradeOwned ? "Đã lắp" : vehicleOwned ? "Đã sở hữu" : owned ? "Mặc" : action !== 'outfit' ? priceLabel :
                outfitPreview !== item ? "Thử · " + priceLabel :
                (indoorShop.name.includes("TIỆM MAY") ? "Đặt may" : "Mua") + " · " + priceLabel;
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(name + " · " + detail, 500, y + 29, 416);
    });
    if (outfitPreview) {
        const preview = { ...playerConfig, outfits: [outfitPreview[3]], outfitIndex: 0 };
        drawBitmapCharacter(472, 378, preview, 'down', 0, false, 1.9);
    }
    pOutlinedRect(ctx, 430, 451, 140, 28, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText("Đóng [Q]", 500, 471);
}

function getShopVisitors(shop) {
    return storyNPCs.filter((npc) => getNPCSchedule(npc.zone, npcRosters[npc.zone].indexOf(npc))
        .some((slot) => slot.shop === shop && playerStats.hour >= slot.start && playerStats.hour < slot.end));
}

function getShopVisitorX(index, total) {
    if (total <= 3) return 341 + index * 142;
    return Math.round(270 + index * (430 / (total - 1)));
}

const shopsByZone = {};
let indoorShop = null;
let outdoorPosition = null;
let hospitalFloor = 0;
let lyingOnHospitalBed = false;

function switchHospitalFloor(floor) {
    const next = Math.max(0, Math.min(2, Number(floor) || 0));
    if (hospitalFloor === next) return;
    hospitalFloor = next;
    GameAudio?.playDoor();
    const names = [
        '🚑 Tầng Trệt: Khoa Cấp Cứu & Tiếp Tân',
        '🩺 Tầng 1: Khoa Khám Bệnh & Truyền Nước',
        '🌟 Tầng 2: Khoa Hồi Sức VIP & Nghỉ Dưỡng'
    ];
    showToast(names[hospitalFloor], 160);
}

function getShopHours(title, rental) {
    if (rental) return [5, 22];
    if (/QUÁN ĂN SÁNG/.test(title)) return [5, 11];
    if (/CƠM TRƯA/.test(title)) return [10, 15];
    if (/SỬA XE/.test(title)) return [7, 18];
    if (/TẠP HÓA VEN KÊNH|TIỆM CHÈ/.test(title)) return [5, 18];
    if (title.includes("CÔ BA")) return [5, GAME_CONFIG.TIME.MARKET_CLOSE_HOUR];
    if (/NEON MƯA ĐÊM|BAR/.test(title)) return [19, 24];
    if (/CLUB|LOUNGE/.test(title)) return [21, 24];
    if (/NƯỚNG|ỐC|LẨU|BIA|NHÀ HÁT/.test(title)) return [16, 24];
    if (/BÁNH|CHỢ KÊNH|HỦ TIẾU|TIỆM CÁ|TIỆM GẠO/.test(title)) return [5, 18];
    if (/XE ĐẠP/.test(title)) return [6, 19];
    if (/BỆNH VIỆN/.test(title)) return [0, 999];
    if (/NGÂN HÀNG|CAO ỐC|VĂN PHÒNG/.test(title)) return [8, 17];
    return [8, 20];
}

function registerShop(zone, title, x, y, w, h, gateW) {
    const rental = (GAME_CONFIG.RENTALS[zone] || []).find((item) => item.x === x && item.y === y);
    if (!rental && (!title || /^(NHÀ (HẺM|VEN|CỔ|GỖ|HOA|HƯƠNG|XƯA|VƯỜN|GẠCH|PHÁP|HỒNG)|DINH THỰ|BIỆT THỰ)/.test(title))) return;
    const name = rental ? rental.name : title.replace(/^[^A-ZÀ-Ỹ]+/u, '');
    const [opens, closes] = getShopHours(title, rental);
    (shopsByZone[zone] ??= []).push({
        name, rental, opens, closes, x, y, w, h, gateW,
        menu: shopMenus.find(([pattern]) => pattern.test(title))?.[1],
        market: title.includes('CÔ BA'), bikes: title.includes('THUÊ XE ĐẠP'),
        nightlife: /CLUB|LOUNGE|BAR/.test(title), food: /NƯỚNG|ỐC|LẨU|BIA|HỦ TIẾU|BÁNH/.test(title)
    });
}

function shopIsOpen(shop) {
    return (!shop.rental || rentedProperties[shop.rental.id]) &&
        playerStats.hour >= shop.opens && playerStats.hour < shop.closes;
}

function shopHoursLabel(shop) {
    if (shop.opens === 0 && shop.closes >= 24) return '24/24';
    const format = (hour) => String(Math.floor(hour)).padStart(2, '0') + (hour % 1 ? ':30' : ':00');
    return format(shop.opens) + '–' + format(shop.closes);
}

function enterShop(shop) {
    if (shop.rental && !rentedProperties[shop.rental.id]) {
        closeAllModals();
        selectedRentalModal = shop.rental;
        return;
    }
    if (!shopIsOpen(shop)) {
        GameAudio?.playError();
        showToast(`🔒 ${shop.name} · Mở ${shopHoursLabel(shop)}`);
        return;
    }
    if (activeVehicle) activeVehicle = null;
    if (coffeeCart.isPushed || ridingBicycle) {
        GameAudio?.playError();
        showToast("Đậu xe cà phê hoặc trả xe đạp trước khi vào.");
        return;
    }
    closeAllModals();
    outdoorPosition = { x: shop.x + shop.w / 2 - 18, y: shop.y + shop.h + 8 };
    indoorShop = shop;
    if (shop.name.includes("BỆNH VIỆN")) {
        hospitalFloor = 0;
        player.x = 482;
        player.y = 528;
    } else {
        player.x = 480;
        player.y = 473;
    }
    player.dir = 'up';
    nearbyInteractable = null;
    GameAudio?.playDoor();
}

function leaveShop() {
    closeAllModals();
    indoorShop = null;
    Object.assign(player, outdoorPosition);
    outdoorPosition = null;
    nearbyInteractable = null;
    GameAudio?.playDoor();
}

function useShopCounter() {
    if (!shopIsOpen(indoorShop)) return;
    if (indoorShop.name.includes("VIETBANK")) { showBankModal = true; return; }
    if (indoorShop.market) triggerInteractable({ type: 'MARKET' });
    else if (indoorShop.bikes) {
        triggerInteractable({ type: 'BICYCLE' });
        if (ridingBicycle) leaveShop();
    } else if (indoorShop.rental) {
        const business = businesses[indoorShop.rental.id];
        const isCafe = !business || business.type.id === 'cafe';
        if (business?.rentOverdue || !isCafe) {
            selectedManagementShop = indoorShop.rental;
            showManagementModal = true;
            GameAudio?.playModalOpen();
        } else {
            closeAllModals();
            activeBrewSpot = { spotId: indoorShop.rental.id, name: indoorShop.name, zoneId: currentZone };
            showBrewModal = true;
            GameAudio?.playModalOpen();
        }
    } else if (indoorShop.menu) {
        showShopMenu = true;
    } else if (indoorShop.name.includes("SKYLINE") && getShopVisitors(indoorShop).some((npc) => npc.id === "ky_duyen")) {
        showToast("Kỳ Duyên đang hát một bản acoustic trên sân khấu.");
    } else {
        showToast(`${indoorShop.name} · Mở cửa ${shopHoursLabel(indoorShop)}`);
    }
}

function currentBusiness() {
    return selectedManagementShop ? businesses[selectedManagementShop.id] : null;
}

function drawManagementModal() {
    const shop = selectedManagementShop;
    const business = currentBusiness();
    const upgrades = business?.upgrades || (business ? (business.upgrades = {}) : {});
    const hasStaff = Boolean(business?.hasStaff);
    const bType = business?.type || businessTypes[0];
    const repFactor = getBusinessReputationFactor(bType);
    const repPct = Math.round(repFactor * 100);
    const rentShare = business ? getBusinessRentDue(business) : (shop?.price || 0);
    const daysLeftRent = getDaysUntilNextRent();
    const isOverdue = Boolean(business?.rentOverdue && business?.overdueAmount > 0);
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20,14,10,0.8)");
    drawStandardModalFrame({
        x: 170,
        y: 72,
        w: 660,
        h: 514,
        title: `QUẢN LÝ · ${bType.name}`,
        titleSize: 18,
        closeButton: false
    });
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
    ctx.fillText(`Uy tín quán ${customerReputation}/100 · Danh tiếng TP ${cityReputation}/100 (Chuẩn ngành: ${bType.idealRep}) · Công suất khách: ${repPct}%`, 500, 134, 620);
    ctx.fillStyle = isOverdue ? "#c0392b" : "#5d4037";
    ctx.fillText(
        isOverdue
            ? `⚠️ ĐANG NỢ TIỀN MẶT BẰNG: ${moneyLabel(business.overdueAmount)} (Quán tạm ngừng sinh lời)`
            : `🏠 Tiền mặt bằng định kỳ (mỗi 25 ngày): ${moneyLabel(rentShare)} · Còn ${daysLeftRent} ngày tới kỳ đóng`,
        500, 158, 620
    );
    const unlockedBase = getUnlockedBaseRecipes();
    const focusRecipe = unlockedBase[dailyRecipeIndex % unlockedBase.length] || GAME_CONFIG.RECIPES[0];
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`Giá bán ${(priceOptions[dailyPriceIndex] * 100).toFixed(0)}% · Món trọng tâm ${focusRecipe.name} · Khách quen hôm nay: ${dailyRegularOrders}/3`, 500, 182, 620);
    pOutlinedRect(ctx, 220, 200, 560, 38, "#fff3d6");
    ctx.fillText(`Giá bán: ${priceOptions.map((v,i)=>`${i===dailyPriceIndex?'●':'○'} ${Math.round(v*100)}%`).join('   ')}`, 500, 224);
    pOutlinedRect(ctx, 220, 246, 560, 38, "#fff3d6");
    ctx.fillText(`Món trọng tâm: ${focusRecipe.name}  ◀ ▶`, 500, 270);
    shopUpgrades.forEach((upgrade,index) => {
        const y=294+index*43; const owned=Boolean(upgrades[upgrade.id]);
        pOutlinedRect(ctx,220,y,560,36,owned?'#b6d6a0':'#fff3d6');
        ctx.fillText(`${upgrade.name} · ${owned?'Đã mua':moneyLabel(upgrade.price)} · ${upgrade.benefit}`,500,y+23,540);
    });
    const staffDesc = business?.type?.id === 'cafe' ? 'Tự bán +240k/ngày (lương 120k)' : 'Tăng +20% lãi ngày (lương 120k)';
    pOutlinedRect(ctx, 220, 426, 560, 38, hasStaff ? '#b6d6a0' : '#fff3d6');
    ctx.fillText(`👨‍🍳 Nhân viên đứng quầy: ${hasStaff ? 'Đang thuê (Bấm để nghỉ)' : 'Chưa thuê (Bấm để thuê)'} · ${staffDesc}`, 500, 450, 540);
    if (isOverdue) {
        pOutlinedRect(ctx, 220, 472, 560, 38, "#f5b7b1");
        ctx.fillStyle = "#922b21";
        ctx.fillText(`💳 Bấm để đóng tiền mặt bằng quá hạn (${moneyLabel(business.overdueAmount)}) & Mở lại quán`, 500, 496, 540);
        ctx.fillStyle = PAL.OUTLINE;
    }
    pOutlinedRect(ctx, 420, 524, 160, 36, "#c84b31");
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Đóng [Q]", 500, 548);
}

function handleManagementClick(x,y) {
    if (x>=420&&x<=580&&y>=524&&y<=560){closeAllModals();return;}
    if (x>=220&&x<=780&&y>=200&&y<=238){dailyPriceIndex=(dailyPriceIndex+1)%priceOptions.length;return;}
    if (x>=220&&x<=780&&y>=246&&y<=284){dailyRecipeIndex=(dailyRecipeIndex+1)%getUnlockedBaseRecipes().length;return;}
    if (x>=220&&x<=780&&y>=426&&y<=464){
        const business=currentBusiness();
        if(!business)return;
        business.hasStaff=!business.hasStaff;
        GameAudio?.playClick();
        showToast(business.hasStaff
            ? "👨‍🍳 Đã thuê nhân viên đứng quầy (trừ 120.000đ/ngày từ doanh thu)."
            : "👨‍🍳 Đã cho nhân viên nghỉ việc.");
        return;
    }
    if (x>=220&&x<=780&&y>=472&&y<=510){
        const business=currentBusiness();
        if(business?.rentOverdue && business.overdueAmount > 0){
            if(playerStats.money < business.overdueAmount){
                GameAudio?.playError();
                showToast(`⚠️ Chưa đủ ${moneyLabel(business.overdueAmount)} để thanh toán nợ mặt bằng.`);
                return;
            }
            const paid = business.overdueAmount;
            playerStats.money -= paid;
            dailyReport.rentCost += paid;
            business.rentOverdue = false;
            business.overdueAmount = 0;
            creditScore = Math.min(100, creditScore + 2);
            GameAudio?.playCoin();
            showToast(`✅ Đã thanh toán ${moneyLabel(paid)} tiền thuê mặt bằng! Quán hoạt động trở lại.`);
            return;
        }
    }
    if (y>=294&&y<423){
        const upgrade=shopUpgrades[Math.floor((y-294)/43)]; const business=currentBusiness();
        if(!business||!upgrade)return;
        business.upgrades ??= {};
        if(business.upgrades[upgrade.id]){showToast("Mày đã có nâng cấp này.");return;}
        if(playerStats.money<upgrade.price){showToast("Chưa đủ tiền mua nâng cấp.");return;}
        playerStats.money-=upgrade.price;business.upgrades[upgrade.id]=true;
        if(upgrade.id==='seating')customerReputation=Math.min(100,customerReputation+8);
        showToast("Đã nâng cấp: "+upgrade.name);
    }
}

function drawBankModal() {
    pRect(ctx,0,0,canvas.width,canvas.height,"rgba(20,14,10,0.8)");
    drawStandardModalFrame({
        x: 170,
        y: 105,
        w: 660,
        h: 445,
        title: "🏦 VIETBANK · VAY VỐN KHỞI NGHIỆP",
        titleSize: 18,
        closeButton: false
    });
    ctx.textAlign="center";ctx.fillStyle=PAL.OUTLINE;
    ctx.font="bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`Nợ ${moneyLabel(bankDebt)} · Trả mỗi sáng ${moneyLabel(dailyLoanPayment)} · Uy tín tín dụng ${creditScore}`,500,178,610);
    loanProducts.forEach((loan,index)=>{
        const y=205+index*68; pOutlinedRect(ctx,220,y,560,58,index===selectedLoanIndex?'#f0d08c':'#fff3d6');
        const daily=Math.ceil((loan.principal+loan.fee)/loan.days);
        ctx.fillText(`${moneyLabel(loan.principal)} · phí ${moneyLabel(loan.fee)} · ${loan.days} ngày`,500,y+23);
        ctx.fillText(`Trả ${moneyLabel(daily)} mỗi sáng`,500,y+45);
    });
    pOutlinedRect(ctx,350,430,300,42,"#aaca8c");
    ctx.fillText("Chọn khoản vay · Nhấn E để xác nhận",500,457);
    pOutlinedRect(ctx,420,493,160,34,"#c84b31");ctx.fillStyle="#ffffff";ctx.fillText("Đóng [Q]",500,516);
}

function handleBankClick(x,y){
    if(y>=493&&y<=527&&x>=420&&x<=580){closeAllModals();return;}
    if(y>=205&&y<=407){selectedLoanIndex=Math.min(2,Math.max(0,Math.floor((y-205)/68)));return;}
    if(y>=430&&y<=472&&x>=350&&x<=650) takeBankLoan();
}

function takeBankLoan(){
    const loan=loanProducts[selectedLoanIndex];
    const limit=5000000+creditScore*400000+Math.min(10000000,customerReputation*100000);
    if(bankDebt>0){GameAudio?.playError();showToast("Trả hết khoản vay hiện tại rồi hãy vay tiếp.");return;}
    if(loan.principal>limit){GameAudio?.playError();showToast("Hồ sơ hiện được duyệt tối đa "+moneyLabel(limit)+". Tăng uy tín cửa hàng hoặc trả đúng hạn.");return;}
    bankDebt=loan.principal+loan.fee;
    dailyLoanPayment=Math.ceil(bankDebt/loan.days);
    playerStats.money+=loan.principal;
    GameAudio?.playCoin();
    closeAllModals();showToast(`VietBank giải ngân ${moneyLabel(loan.principal)}. Bắt đầu trả ${moneyLabel(dailyLoanPayment)} mỗi sáng.`);
}

function updateShopInterior() {
    if (!shopIsOpen(indoorShop)) {
        const name = indoorShop.name;
        leaveShop();
        showToast(`${name} đã đóng cửa.`);
        return;
    }
    if (indoorShop.rental) updateShopCustomers();
    if (indoorShop.name.includes("BỆNH VIỆN")) {
        const hospitalColliders = [
            { x: 340, y: 184, w: 320, h: 74 }
        ];
        if (hospitalFloor === 0) {
            hospitalColliders.push(
                { x: 118, y: 240, w: 120, h: 72 },
                { x: 762, y: 326, w: 120, h: 72 },
                { x: 118, y: 452, w: 150, h: 36 },
                { x: 732, y: 462, w: 150, h: 36 }
            );
        } else if (hospitalFloor === 1) {
            hospitalColliders.push(
                { x: 118, y: 260, w: 110, h: 86 },
                { x: 118, y: 390, w: 110, h: 86 },
                { x: 772, y: 306, w: 110, h: 86 },
                { x: 732, y: 462, w: 150, h: 38 }
            );
        } else {
            hospitalColliders.push(
                { x: 118, y: 248, w: 132, h: 96 },
                { x: 750, y: 310, w: 132, h: 96 },
                { x: 130, y: 420, w: 140, h: 52 },
                { x: 730, y: 444, w: 140, h: 52 }
            );
        }
        updatePlayerMovement(102, 898, 232, 578, hospitalColliders);
        if (player.isMoving && lyingOnHospitalBed) lyingOnHospitalBed = false;
        if (!isAnyModalOpen() && player.y >= 546 && player.x >= 435 && player.x <= 545 &&
            (keys.s || keys.ArrowDown)) leaveShop();
        return;
    }
    const shopColliders = [
        { x: 260, y: 314, w: 48, h: 77 },
        { x: 690, y: 314, w: 48, h: 77 }
    ];
    if (indoorShop.market || indoorShop.name.includes("GẠO") || indoorShop.name.includes("CÁ") || indoorShop.name.includes("BÁNH")) {
        shopColliders.push({ x: 232, y: 396, w: 62, h: 36 }, { x: 706, y: 396, w: 62, h: 36 });
    }
    const visitorsForCol = getShopVisitors(indoorShop);
    visitorsForCol.forEach((_, index) => {
        shopColliders.push({ x: getShopVisitorX(index, visitorsForCol.length) + 6, y: 419, w: 24, h: 18, dynamic: true });
    });
    updatePlayerMovement(238, 762, 265, 538, shopColliders);
    if (!isAnyModalOpen() && player.y >= 492 && player.x >= 440 && player.x <= 525 &&
        (keys.s || keys.ArrowDown)) leaveShop();
}

function drawHospitalInterior(shop) {
    const floorNames = [
        "🚑 TẦNG TRỆT: CẤP CỨU & TIẾP TÂN",
        "🩺 TẦNG 1: KHOA KHÁM BỆNH & TRUYỀN NƯỚC",
        "🌟 TẦNG 2: KHOA HỒI SỨC VIP & NGHỈ DƯỠNG"
    ];

    // Nền tối xung quanh & khung Bệnh Viện lớn xịn xò (840x522)
    pRect(ctx, 0, 0, canvas.width, canvas.height, "#131b22");
    pRect(ctx, 74, 68, 852, 534, "rgba(0,0,0,0.45)");
    pOutlinedRect(ctx, 80, 74, 840, 522, "#2b5b73");

    // Tường trên theo từng tầng
    const wallBg = hospitalFloor === 2 ? "#f6efe2" : "#e6f2f7";
    pRect(ctx, 86, 80, 828, 90, wallBg);
    pRect(ctx, 86, 164, 828, 8, hospitalFloor === 2 ? "#b88a55" : "#2b7a9b");

    // Cửa sổ kính lớn hai bên tường
    for (const wx of [108, 194, 758, 844]) {
        pOutlinedRect(ctx, wx, 92, 48, 54, "#2b5b73");
        pRect(ctx, wx + 4, 96, 40, 46, hospitalFloor === 2 ? "#b6e3f4" : "#9ed5ea");
        pRect(ctx, wx + 22, 96, 3, 46, "#2b5b73");
        pRect(ctx, wx + 8, 102, 10, 14, "rgba(255,255,255,0.45)");
    }

    // Biển tên tầng trung tâm
    pOutlinedRect(ctx, 296, 86, 408, 66, "#1b4965");
    pOutlinedRect(ctx, 302, 92, 396, 54, "#2b7a9b");
    ctx.textAlign = "center";
    ctx.font = "bold 17px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("🏥 BỆNH VIỆN ĐA KHOA SÀI GÒN", 500, 114);
    ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffe082";
    ctx.fillText(floorNames[hospitalFloor], 500, 136);

    // Sàn nhà theo tầng (Tầng 2 lát sàn gỗ cao cấp, Trệt & Tầng 1 lát đá hoa cương y tế)
    const floorBg = hospitalFloor === 2 ? "#e8d5bc" : "#eef6f9";
    pRect(ctx, 86, 172, 828, 418, floorBg);
    for (let y = 172; y < 590; y += 32) {
        pRect(ctx, 86, y, 828, 1, hospitalFloor === 2 ? "rgba(110,75,45,0.14)" : "rgba(43,91,115,0.12)");
    }
    for (let x = 86; x < 914; x += 40) {
        pRect(ctx, x, 172, 1, 418, hospitalFloor === 2 ? "rgba(110,75,45,0.14)" : "rgba(43,91,115,0.12)");
    }

    // Thảm dẫn lối trung tâm
    pOutlinedRect(ctx, 434, 272, 132, 278, hospitalFloor === 2 ? "#2e7d6b" : "#3a8fb7");
    pRect(ctx, 442, 280, 116, 262, hospitalFloor === 2 ? "#469e8a" : "#64b5d6");

    // 3 nút bấm chuyển tầng ở góc trên phải
    const floorTabs = [
        [0, "1. Trệt: Cấp Cứu"],
        [1, "2. Tầng 1: Khám"],
        [2, "3. Tầng 2: VIP"]
    ];
    floorTabs.forEach(([idx, label]) => {
        const bx = 446 + idx * 124;
        const by = 40;
        const isSel = hospitalFloor === idx;
        pOutlinedRect(ctx, bx, by, 118, 28, isSel ? "#f0b643" : "#d9e7ee");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, bx + 59, by + 18);
    });

    // Thang máy & Cầu thang bộ bên góc trên phải trong sảnh
    pOutlinedRect(ctx, 804, 176, 98, 56, "#37474f");
    pRect(ctx, 812, 184, 38, 42, "#90a4ae");
    pRect(ctx, 854, 184, 38, 42, "#90a4ae");
    ctx.fillStyle = "#ffe082";
    ctx.font = "bold 10px 'Chakra Petch', sans-serif";
    ctx.fillText("🛗 THANG MÁY", 853, 170);

    // Quầy Tiếp Tân / Điều Dưỡng trung tâm (vùng click 340..660, 184..258)
    pRect(ctx, 344, 190, 320, 74, "rgba(0,0,0,0.18)");
    pOutlinedRect(ctx, 340, 184, 320, 74, "#2b7a9b");
    pRect(ctx, 344, 188, 312, 18, "#ffffff");
    pOutlinedRect(ctx, 488, 190, 24, 14, "#ffffff");
    pRect(ctx, 497, 192, 6, 10, "#d9383a");
    pRect(ctx, 494, 195, 12, 4, "#d9383a");
    pOutlinedRect(ctx, 368, 186, 32, 22, "#263238");
    pRect(ctx, 372, 190, 24, 14, "#80deea");
    pOutlinedRect(ctx, 600, 186, 32, 22, "#263238");
    pRect(ctx, 604, 190, 24, 14, "#80deea");

    // Bác sĩ / Y tá trực quầy
    drawBitmapCharacter(484, 174, {
        genderIndex: hospitalFloor === 1 ? 0 : 1,
        look: [1.0, 1.04, hospitalFloor === 1 ? 'crop' : 'bun', '#392521', 0, 'none', 'plain', '#ffffff', '#cfd8dc'],
        outfitIndex: 0,
        outfits: [{ color: '#ffffff', shadow: '#cfd8dc', shorts: '#2b7a9b' }],
        accessoryIndex: 0,
        accessories: [{ type: 'none' }]
    }, 'down', 0, false, 1.3);

    ctx.textAlign = "center";
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(
        hospitalFloor === 0 ? "🚑 Quầy Cấp Cứu & Hồi Sức [E]" : hospitalFloor === 1 ? "🩺 Bàn Khám & Truyền Nước [E]" : "🌟 Quầy Điều Dưỡng VIP [E]",
        500, 236
    );
    ctx.font = "11px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffe082";
    ctx.fillText("Click hoặc nhấn [E] để dùng dịch vụ hồi phục", 500, 252);

    // Nội thất chi tiết từng tầng
    const drawMedicalBed = (bx, by, vip = false) => {
        pOutlinedRect(ctx, bx, by, 114, 68, vip ? "#6d4c41" : "#546e7a");
        pRect(ctx, bx + 4, by + 4, 106, 60, "#ffffff");
        pOutlinedRect(ctx, bx + 8, by + 12, 24, 44, "#e3f2fd");
        pRect(ctx, bx + 36, by + 6, 72, 56, vip ? "#2e7d6b" : "#4fc3f7");
        // Máy đo nhịp tim ECG bên cạnh giường
        pOutlinedRect(ctx, bx + 10, by - 22, 34, 22, "#263238");
        pRect(ctx, bx + 13, by - 19, 28, 16, "#0d2b24");
        const pulseX = bx + 15 + ((tickCount % 22));
        pRect(ctx, bx + 15, by - 11, 24, 2, "#2ecc71");
        pRect(ctx, pulseX, by - 16, 2, 10, "#7effa7");
        // Cây treo bình truyền dịch
        pRect(ctx, bx + 98, by - 24, 4, 26, "#b0bec5");
        pOutlinedRect(ctx, bx + 92, by - 24, 12, 14, "#b3e5fc");
    };

    if (hospitalFloor === 0) {
        // Tầng Trệt: 2 Khoang Cấp Cứu trái/phải + Ghế chờ (chừa lối đi lên thang máy góc trên phải)
        pOutlinedRect(ctx, 100, 200, 210, 140, "rgba(217, 56, 58, 0.12)");
        pOutlinedRect(ctx, 690, 286, 210, 140, "rgba(217, 56, 58, 0.12)");
        drawMedicalBed(118, 242, false);
        drawMedicalBed(762, 328, false);
        ctx.fillStyle = "#b71c1c";
        ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
        ctx.fillText("GIƯỜNG CẤP CỨU 01", 175, 330);
        ctx.fillText("GIƯỜNG CẤP CỨU 02", 818, 416);

        // Hàng ghế chờ cấp cứu dưới
        for (const [gx, gy] of [[118, 452], [732, 462]]) {
            pOutlinedRect(ctx, gx, gy, 150, 34, "#2b7a9b");
            for (let i = 0; i < 3; i++) pOutlinedRect(ctx, gx + 8 + i * 48, gy + 6, 38, 22, "#80deea");
        }
    } else if (hospitalFloor === 1) {
        // Tầng 1: 3 Giường Truyền Nước + Bảng đo thị lực + Ghế chờ
        drawMedicalBed(118, 268, false);
        drawMedicalBed(118, 396, false);
        drawMedicalBed(772, 314, false);
        pOutlinedRect(ctx, 732, 462, 150, 36, "#2b7a9b");
        for (let i = 0; i < 3; i++) pOutlinedRect(ctx, 740 + i * 48, 468, 38, 24, "#80deea");
        // Bảng thị lực treo tường
        pOutlinedRect(ctx, 272, 88, 32, 46, "#ffffff");
        ctx.fillStyle = "#263238";
        ctx.font = "bold 10px monospace";
        ctx.fillText("E", 288, 104);
        ctx.fillText("F P", 288, 118);
        ctx.fillText("T O Z", 288, 130);
    } else {
        // Tầng 2: 2 Phòng Hồi Sức VIP + Sofa + Bàn trà hoa + TV
        pOutlinedRect(ctx, 98, 198, 224, 300, "rgba(46, 125, 107, 0.14)");
        pOutlinedRect(ctx, 678, 278, 224, 242, "rgba(46, 125, 107, 0.14)");
        drawMedicalBed(118, 250, true);
        drawMedicalBed(750, 312, true);
        // Sofa & Bàn trà VIP
        for (const [sx, sy] of [[130, 422], [730, 446]]) {
            pOutlinedRect(ctx, sx, sy, 140, 24, "#2e7d6b");
            pOutlinedRect(ctx, sx + 32, sy + 32, 76, 28, "#8d6e63");
            pRect(ctx, sx + 64, sy + 38, 12, 12, "#f48fb1"); // Bình hoa bàn trà
        }
        drawTerracottaPlant(ctx, 348, 480, 1.3);
        drawTerracottaPlant(ctx, 652, 480, 1.3);
    }

    // Khách / NPC đang trực hoặc có mặt trong bệnh viện (hỗ trợ nói chuyện & hẹn hò)
    const visitors = getShopVisitors(shop);
    visitors.forEach((npc, index) => {
        if (lyingOnHospitalBed && npc.id === 'bac_si_tuan') return;
        const x = getShopVisitorX(index, visitors.length);
        drawBitmapCharacter(x, 401, {
            genderIndex: npc.genderIndex, look: npc.look, outfitIndex: 0,
            outfits: [{ color: npc.shirt, shadow: npc.shadow, shorts: npc.shorts }],
            accessoryIndex: 0, accessories: [{ type: npc.accessory || 'none' }]
        }, 'down', 0, false, 1.4);
        ctx.textAlign = "center";
        ctx.fillStyle = "#1b4965";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(npc.name, x + 16, 396, 120);
    });

    // Nếu vừa ngất xỉu tỉnh dậy: vẽ người chơi nằm trên giường cấp cứu 01 + Bác sĩ đứng cạnh giường
    if (lyingOnHospitalBed && hospitalFloor === 0) {
        const doc = storyNPCs.find((n) => n.id === 'bac_si_tuan');
        if (doc) {
            drawBitmapCharacter(242, 256, {
                genderIndex: doc.genderIndex, look: doc.look, outfitIndex: 0,
                outfits: [{ color: doc.shirt, shadow: doc.shadow, shorts: doc.shorts }],
                accessoryIndex: 0, accessories: [{ type: doc.accessory || 'none' }]
            }, 'left', 0, false, 1.45);
            ctx.textAlign = "center";
            ctx.fillStyle = "#1b4965";
            ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
            ctx.fillText(doc.name, 260, 248);
        }
        // Vẽ người chơi đang nằm nghỉ trên giường cấp cứu 01 (bx=118, by=242)
        ctx.save();
        ctx.translate(184, 276);
        ctx.rotate(-Math.PI / 2);
        drawBitmapCharacter(-18, -22, playerConfig, 'down', 0, false, 1.35);
        ctx.restore();
    } else {
        // Nhân vật của người chơi đi lại bình thường
        drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
        drawPlayerNameLabel(player.x, player.y);
    }

    // Nút Ra ngoài ở cổng chính dưới
    pOutlinedRect(ctx, 431, 556, 138, 32, "#2b7a9b");
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("🚪 Ra ngoài [Q]", 500, 577);

    drawMinimalHUD(`${shop.name} (${hospitalFloor === 0 ? 'Trệt' : 'Tầng ' + hospitalFloor})`);
    if (showShopMenu) drawShopMenu();
    drawDialogueModal();
    drawSleepSummaryModal();
    drawToastOverlay();
    drawScreenPopups();
}

function drawShopInterior() {
    const shop = indoorShop;
    if (shop.name.includes("BỆNH VIỆN")) {
        drawHospitalInterior(shop);
        return;
    }
    const isNight = Boolean(shop.nightlife);
    const isTheater = shop.name.includes("NHÀ HÁT");
    const isRooftop = shop.name.includes("BIA SÂN THƯỢNG");
    const isShowroom = shop.name.includes("SHOWROOM");
    const isRepair = shop.name.includes("SỬA XE");
    const isFashion = shop.name.includes("SAIGON CHIC") || shop.name.includes("TIỆM MAY");
    const isJewelryOrShoe = shop.name.includes("TRANG SỨC") || shop.name.includes("GIÀY");
    const isBank = shop.name.includes("VIETBANK");
    const isHospital = shop.name.includes("BỆNH VIỆN");
    const isFlorist = shop.name.includes("HOA");
    const isBookOrAntique = shop.name.includes("SÁCH") || shop.name.includes("ĐỒ CỔ");
    const isBakeryOrTea = shop.name.includes("L'AMOUR") || shop.name.includes("L’AMOUR") || shop.name.includes("TRÀ") || shop.name.includes("CHÈ");
    const isFoodOrRooftop = Boolean(shop.food || shop.name.includes("ĂN SÁNG") || shop.name.includes("CƠM") || isRooftop);
    const isResidence = !shop.rental && !shop.menu && !shop.market && !shop.bikes && !isBank && !isHospital && !isTheater && !isNight && !isShowroom && !isRepair && !isFashion && !isJewelryOrShoe && !isBookOrAntique && !isBakeryOrTea && !isFoodOrRooftop && !isFlorist;
    const accent = isNight ? "#7f4eb0" : isTheater ? "#8c1d4c" : isHospital ? "#2b7a9b" : isBank ? "#2e6b5e" : isRepair ? "#455a64" : isFoodOrRooftop ? "#a65b40" : "#537765";

    // Nền tối xung quanh & khung tường phòng
    pRect(ctx, 0, 0, canvas.width, canvas.height, "#1b141b");
    pRect(ctx, 210, 98, 580, 447, "rgba(0,0,0,0.45)");
    pOutlinedRect(ctx, 216, 104, 568, 435, "#69524f");

    // Tường trên với phào chỉ gỗ & giấy dán tường theo chủ đề
    const wallBg = isNight ? "#2a1e38" : isRooftop ? "#1a233a" : isTheater ? "#3d1624" : isHospital ? "#e8f4f8" : isBank ? "#dce6e0" : isShowroom ? "#dfe4ea" : isRepair ? "#cfd8dc" : isBakeryOrTea ? "#f5e9d9" : "#f2dfc1";
    pRect(ctx, 222, 110, 556, 79, wallBg);
    if (isRooftop) {
        for (const [sx, sy] of [[260,124],[310,148],[395,120],[620,130],[690,122],[745,146]]) {
            pRect(ctx, sx, sy, 3, 3, "#ffe082");
        }
        for (let i = 0; i < 12; i++) {
            pRect(ctx, 236 + i * 46, 176, 6, 6, i % 2 ? "#ffd54f" : "#ff9800");
        }
    } else {
        for (let wx = 230; wx < 770; wx += 28) {
            pRect(ctx, wx, 110, 2, 79, (isNight || isTheater) ? "rgba(255,255,255,0.05)" : "rgba(120,85,55,0.08)");
        }
    }
    pRect(ctx, 222, 182, 556, 7, isNight ? "#4f3669" : isTheater ? "#7a2339" : isRooftop ? "#4a5b7c" : "#8b5e3c");

    // Hai cửa sổ (ẩn nếu là sân thượng mở hoặc nhà hát)
    if (!isRooftop && !isTheater) {
        for (const wx of [246, 706]) {
            pOutlinedRect(ctx, wx, 122, 48, 46, isNight ? "#3c2752" : "#704a34");
            pRect(ctx, wx + 4, 126, 40, 38, isNight ? "#673ab7" : "#a8d5e5");
            pRect(ctx, wx + 22, 126, 3, 38, isNight ? "#3c2752" : "#704a34");
            pRect(ctx, wx + 4, 143, 40, 3, isNight ? "#3c2752" : "#704a34");
            if (!isNight) {
                pRect(ctx, wx + 8, 130, 8, 10, "rgba(255,255,255,0.45)");
            }
        }
    }

    // Biển tên & Giờ mở cửa treo trang trọng trên tường
    pOutlinedRect(ctx, 326, 115, 348, 60, isNight ? "#3d2654" : isTheater ? "#4a1220" : "#3a261d");
    pOutlinedRect(ctx, 331, 120, 338, 50, isNight ? "#563278" : isTheater ? "#6b1b30" : "#5b3b2c");
    ctx.textAlign = "center";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#ffe099";
    ctx.fillText(shop.name, 500, 144, 320);
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#e6d2b5";
    ctx.fillText(isResidence ? "🏡 Không gian sinh hoạt" : "🕒 Giờ mở cửa: " + shopHoursLabel(shop), 500, 163);

    // Sàn nhà theo từng nhóm cửa hàng
    const floorBg = isNight ? "#2c2238" : isTheater ? "#4b1f29" : isRooftop ? "#4a4e5c" : isShowroom ? "#d5dde5" : isRepair ? "#a6aeb3" : isHospital ? "#eef6f9" : isBank ? "#dce7e2" : isBakeryOrTea ? "#d2b48c" : "#d8bc98";
    pRect(ctx, 222, 189, 556, 344, floorBg);
    for (let y = 189; y < 532; y += 28) {
        pRect(ctx, 222, y, 556, 1, (isNight || isTheater || isRooftop) ? "rgba(255,255,255,0.06)" : "rgba(56,35,37,0.16)");
    }
    for (let x = 222; x < 777; x += 36) {
        pRect(ctx, x, 189, 1, 344, (isNight || isTheater || isRooftop) ? "rgba(255,255,255,0.06)" : "rgba(56,35,37,0.16)");
    }

    // Sàn giữa đặc trưng từng nhóm (không dùng chung 1 cái thảm cam cho tất cả nữa)
    if (isNight) {
        const beatFloor = Math.floor(performance.now() / 220);
        const floorCols = ["rgba(255,46,147,0.22)", "rgba(0,229,255,0.20)", "rgba(184,77,255,0.22)", "rgba(255,230,0,0.18)"];
        for (let ry = 304; ry < 448; ry += 28) {
            for (let rx = 342; rx < 658; rx += 36) {
                const tileIdx = (Math.floor(rx / 36) + Math.floor(ry / 28) + beatFloor) % floorCols.length;
                pRect(ctx, rx + 2, ry + 2, 32, 24, floorCols[tileIdx]);
            }
        }
        pOutlinedRect(ctx, 336, 300, 328, 152, "rgba(184,77,255,0.25)");
        pOutlinedRect(ctx, 448, 480, 104, 18, "#4a2768");
    } else if (isTheater) {
        // Thảm đỏ dẫn lối lên sân khấu + 3 hàng ghế nhung đỏ xếp bậc
        pRect(ctx, 472, 286, 56, 198, "#9c2238");
        for (const rowY of [314, 356, 398]) {
            for (let sx = 282; sx <= 682; sx += 38) {
                if (sx >= 452 && sx <= 516) continue;
                pOutlinedRect(ctx, sx, rowY, 28, 22, "#a3223a");
                pRect(ctx, sx + 4, rowY + 4, 20, 8, "#d44b64");
            }
        }
        pOutlinedRect(ctx, 448, 480, 104, 18, "#7a1d30");
    } else if (isShowroom) {
        // Vạch phản quang sàn đá Showroom
        pOutlinedRect(ctx, 290, 305, 420, 145, "rgba(255,255,255,0.22)");
        pOutlinedRect(ctx, 448, 480, 104, 18, "#546e7a");
    } else if (isRepair) {
        // Sàn xi măng gara + vết dầu mờ & thảm cao su
        pRect(ctx, 380, 360, 48, 18, "rgba(35,38,42,0.25)");
        pRect(ctx, 560, 390, 62, 22, "rgba(35,38,42,0.22)");
        pOutlinedRect(ctx, 448, 480, 104, 18, "#455a64");
    } else if (isBank) {
        // Sàn đá cẩm thạch xanh-trắng + hàng ghế chờ ngân hàng
        pOutlinedRect(ctx, 340, 316, 320, 128, "#b7d4c8");
        for (let gx = 365; gx <= 610; gx += 75) {
            pOutlinedRect(ctx, gx, 405, 56, 16, "#2e6b5e");
        }
        pOutlinedRect(ctx, 448, 480, 104, 18, "#2e6b5e");
    } else if (isFoodOrRooftop) {
        // Quán ăn / Đồ nướng / Lẩu / Bia sân thượng: sàn sạch, đặt bàn ăn ở giữa (không vẽ thảm)
        pOutlinedRect(ctx, 448, 480, 104, 18, isRooftop ? "#37474f" : "#8b5e3c");
    } else {
        for (let ry = 290; ry < 470; ry += 28) {
            for (let rx = 330; rx < 660; rx += 36) {
                if (((rx + ry) / 2) % 2 === 0) {
                    pRect(ctx, rx + 2, ry + 2, 32, 24, "rgba(166, 91, 64, 0.10)");
                }
            }
        }
        pOutlinedRect(ctx, 356, 316, 288, 128, isResidence ? "#7c583c" : isBakeryOrTea ? "#8d6e63" : "#b85d45");
        pOutlinedRect(ctx, 366, 324, 268, 112, isResidence ? "#b88d65" : isBakeryOrTea ? "#c9a67d" : "#d9885b");
        pOutlinedRect(ctx, 448, 480, 104, 18, "#8b5e3c");
    }

    // Hai chậu cây xanh trang trí góc trên
    drawTerracottaPlant(ctx, 244, 214, 1.15);
    drawTerracottaPlant(ctx, 756, 214, 1.15);

    // Kệ hàng / Tủ trưng bày hai bên theo loại cửa hàng
    if (shop.market || shop.name.includes("GẠO") || shop.name.includes("CÁ") || shop.name.includes("BÁNH")) {
        // Hai kệ gỗ trưng bày thực phẩm & trái cây hai bên tường
        for (const [idx, sx] of [228, 698].entries()) {
            pOutlinedRect(ctx, sx, 220, 74, 92, "#7c4d34");
            pRect(ctx, sx + 4, 224, 66, 84, "#5d3724");
            for (const py of [246, 274, 302]) pRect(ctx, sx + 4, py, 66, 4, "#b88658");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            const rows = idx === 0
                ? [['🍊', '🍎', '🍌'], ['🥬', '🥕', '🍅'], ['🫘', '🥫', '🥖']]
                : [['🍉', '🍍', '🥭'], ['🥖', '🥐', '🧀'], ['🥫', '🥛', '🥚']];
            rows.forEach((icons, r) => {
                icons.forEach((ic, c) => {
                    ctx.fillText(ic, sx + 15 + c * 22, 243 + r * 28);
                });
            });
        }
        // Sọt trái cây & bao hàng đặt dưới sàn ngay trước kệ
        pOutlinedRect(ctx, 232, 396, 62, 36, "#a67c52");
        pRect(ctx, 236, 400, 54, 28, "#d4a76a");
        ctx.font = "15px 'Chakra Petch', sans-serif";
        ctx.fillText("🍊🍎", 252, 420);
        ctx.fillText("🍌", 278, 420);

        pOutlinedRect(ctx, 706, 396, 62, 36, "#a67c52");
        pRect(ctx, 710, 400, 54, 28, "#e8d5b7");
        ctx.fillText("🥖🫘", 726, 420);
        ctx.fillText("🥬", 752, 420);
    } else if (isFlorist) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 88, "#5d4037");
            pRect(ctx, sx + 4, 226, 66, 80, "#4e342e");
            for (const py of [252, 280]) pRect(ctx, sx + 4, py, 66, 4, "#8d6e63");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            [['🌹', '🌻', '🌷'], ['🌺', '🌸', '💐'], ['🪴', '🌼', '🌱']].forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 28));
            });
        }
    } else if (isBookOrAntique) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 220, 74, 90, "#4e342e");
            pRect(ctx, sx + 4, 224, 66, 82, "#3e2723");
            for (const py of [250, 278]) pRect(ctx, sx + 4, py, 66, 4, "#8d6e63");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            const rows = shop.name.includes("ĐỒ CỔ")
                ? [['🏺', '🕰️', '🪙'], ['🍵', '🪔', '📿'], ['🗿', '⚱️', '🖼️']]
                : [['📚', '📖', '📕'], ['📗', '📘', '📙'], ['📓', '📜', '✒️']];
            rows.forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 244 + r * 28));
            });
        }
    } else if (shop.name.includes("SỬA XE")) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 86, "#455a64");
            pRect(ctx, sx + 4, 226, 66, 78, "#37474f");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            [['🔧', '⚙️', '🧰'], ['🛞', '🔩', '🛢️'], ['🚲', '🛵', '🔑']].forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 27));
            });
        }
    } else if (shop.name.includes("TRANG SỨC")) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 86, "#7b1fa2");
            pRect(ctx, sx + 4, 226, 66, 78, "#f3e5f5");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            [['💍', '💎', '👑'], ['📿', '⌚', '✨'], ['💍', '🔮', '💎']].forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 27));
            });
        }
    } else if (shop.name.includes("GIÀY")) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 86, "#6d4c41");
            pRect(ctx, sx + 4, 226, 66, 78, "#efebe9");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            [['👟', '👠', '👞'], ['🥾', '🥿', '👡'], ['👟', '🧦', '👞']].forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 27));
            });
        }
    } else if (isFashion) {
        const isTailor = shop.name.includes("TIỆM MAY");
        for (const [idx, sx] of [228, 698].entries()) {
            pOutlinedRect(ctx, sx, 222, 74, 88, isTailor ? "#6d4c41" : "#6a3d66");
            pRect(ctx, sx + 4, 226, 66, 80, isTailor ? "#f5e6d3" : "#fceef5");
            for (const py of [252, 280]) pRect(ctx, sx + 4, py, 66, 4, isTailor ? "#9c6b43" : "#c48fb8");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            const rows = isTailor
                ? (idx === 0
                    ? [['👔', '🧥', '👕'], ['🧵', '🪡', '✂️'], ['🧶', '📏', '🧣']]
                    : [['👖', '🦺', '👔'], ['🧵', '🎨', '🪡'], ['🧣', '🧤', '🧥']])
                : (idx === 0
                    ? [['👗', '🧥', '👚'], ['👜', '👒', '👠'], ['✨', '🕶️', '🧣']]
                    : [['🧥', '👗', '👘'], ['💎', '👜', '👠'], ['👒', '🧣', '✨']]);
            rows.forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 28));
            });
        }
        // Giá treo đồ & ma-nơ-canh / cuộn vải trưng bày hai bên dưới
        if (isTailor) {
            pOutlinedRect(ctx, 232, 396, 66, 36, "#7c4d34");
            const boltColors = ["#526a91", "#64805c", "#b37c56", "#8c3f4a"];
            boltColors.forEach((col, i) => {
                pOutlinedRect(ctx, 237 + i * 14, 401, 11, 26, col);
            });
            pOutlinedRect(ctx, 702, 396, 66, 36, "#7c4d34");
            pRect(ctx, 706, 400, 58, 28, "#f5e6d3");
            ctx.font = "15px 'Chakra Petch', sans-serif";
            ctx.fillText("👔🧥", 724, 420);
            ctx.fillText("✂️", 750, 420);
        } else {
            for (const [mx, col] of [[244, "#7e57c2"], [712, "#d81b60"]]) {
                pOutlinedRect(ctx, mx, 392, 46, 44, "#f8e8f2");
                pRect(ctx, mx + 17, 398, 12, 10, "#e0b088");
                pOutlinedRect(ctx, mx + 11, 408, 24, 22, col);
            }
        }
    } else if (isShowroom) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 86, "#455a64");
            pRect(ctx, sx + 4, 226, 66, 78, "#eceff1");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            [['🚲', '🛵', '🏍️'], ['🚗', '🚙', '🏎️'], ['🔑', '🛡️', '✨']].forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 27));
            });
        }
    } else if (!isNight && (shop.food || shop.name.includes("ĂN SÁNG") || shop.name.includes("CƠM") || shop.name.includes("TRÀ") || shop.name.includes("CHÈ") || shop.rental)) {
        for (const sx of [228, 698]) {
            pOutlinedRect(ctx, sx, 222, 74, 86, "#7c4d34");
            pRect(ctx, sx + 4, 226, 66, 78, "#fff3e0");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            const rows = shop.name.includes("TRÀ")
                ? [['🍵', '🫖', '🌿'], ['🧋', '🍪', '🍯'], ['🎋', '🍵', '🕯️']]
                : (shop.rental && (!businesses[shop.rental.id] || businesses[shop.rental.id]?.type.id === 'cafe'))
                    ? [['☕', '🧋', '🥛'], ['🫘', '🍊', '🥐'], ['🍰', '🧁', '🧊']]
                    : [['🍜', '🍲', '🍗'], ['🍤', '🍢', '🍚'], ['🥤', '🍵', '🥢']];
            rows.forEach((icons, r) => {
                icons.forEach((ic, c) => ctx.fillText(ic, sx + 15 + c * 22, 246 + r * 27));
            });
        }
        if (shop.name.includes("NƯỚNG")) {
            pOutlinedRect(ctx, 232, 396, 66, 36, "#4a231c");
            pRect(ctx, 236, 400, 58, 28, "#8c2d19");
            ctx.font = "15px 'Chakra Petch', sans-serif";
            ctx.fillText("🔥🍢🔥", 265, 420);
            pOutlinedRect(ctx, 702, 396, 66, 36, "#4a231c");
            pRect(ctx, 706, 400, 58, 28, "#8c2d19");
            ctx.fillText("🍖🔥🍗", 735, 420);
        }
    } else if (isBank) {
        pOutlinedRect(ctx, 234, 222, 64, 72, "#2f4f4f");
        pOutlinedRect(ctx, 246, 234, 40, 48, "#546e7a");
        pOutlinedRect(ctx, 262, 252, 10, 10, "#ffd54f");
        pOutlinedRect(ctx, 704, 222, 62, 62, "#1b4332");
        ctx.fillStyle = "#a3e635";
        ctx.font = "bold 10px 'Chakra Petch', sans-serif";
        ctx.fillText("LÃI SUẤT", 735, 244);
        ctx.fillText("VIETBANK", 735, 262);
    }

    // Hiệu ứng đèn xập xình bên trong Bar/Club & Quán Đồ Nướng
    const isBBQ = shop.name.includes("NƯỚNG");
    if (isNight || isBBQ) {
        const beat = Math.floor(performance.now() / (isNight ? 180 : 260));
        const partyPalette = isNight
            ? ['#ff2e93', '#00e5ff', '#ffe600', '#b84dff']
            : ['#ff5722', '#ff9800', '#ffd54f', '#ff3d00'];
        ctx.save();
        // Đèn dây nhấp nháy dọc trần phòng
        for (let i = 0; i < 14; i++) {
            const bx = 236 + i * 39;
            const col = partyPalette[(i + beat) % partyPalette.length];
            pRect(ctx, bx, 189, 8, 8, col);
        }
        // Luồng ánh sáng quét sàn
        ctx.globalAlpha = isNight ? 0.16 : 0.11;
        const c1 = partyPalette[beat % partyPalette.length];
        const c2 = partyPalette[(beat + 2) % partyPalette.length];
        const sway = Math.sin(performance.now() / 360) * 90;
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.moveTo(310, 189);
        ctx.lineTo(390 + sway, 460);
        ctx.lineTo(480 + sway, 460);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.moveTo(690, 189);
        ctx.lineTo(520 - sway, 460);
        ctx.lineTo(610 - sway, 460);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    const visitors = getShopVisitors(shop);
    const kyDuyenOnStage = isNight && shop.name.includes("SKYLINE")
        ? visitors.find((npc) => npc.id === 'ky_duyen')
        : null;
    const floorVisitors = kyDuyenOnStage
        ? visitors.filter((npc) => npc.id !== 'ky_duyen')
        : visitors;

    if (isNight) {
        // 1. Sân khấu biểu diễn bên trái/giữa (x = 242..526, y = 194..276)
        pRect(ctx, 246, 200, 284, 78, "rgba(0,0,0,0.35)");
        pOutlinedRect(ctx, 242, 194, 284, 78, "#4a2168");
        pRect(ctx, 248, 200, 272, 62, "#2f1545");
        // Rèm nhung hai bên & đèn sân khấu
        pOutlinedRect(ctx, 242, 194, 24, 68, "#8c1d4c");
        pOutlinedRect(ctx, 502, 194, 24, 68, "#8c1d4c");
        // Hai loa thùng hai góc sân khấu
        pOutlinedRect(ctx, 270, 204, 24, 38, "#1b1b22");
        pRect(ctx, 276, 210, 12, 12, "#455a64");
        pRect(ctx, 276, 226, 12, 12, "#455a64");
        pOutlinedRect(ctx, 474, 204, 24, 38, "#1b1b22");
        pRect(ctx, 480, 210, 12, 12, "#455a64");
        pRect(ctx, 480, 226, 12, 12, "#455a64");
        // Bậc thang nhỏ lên sân khấu
        pOutlinedRect(ctx, 356, 270, 56, 8, "#7b3fa0");

        if (kyDuyenOnStage) {
            // Vòng spotlight & Ca sĩ Kỳ Duyên hát Acoustic trên sân khấu
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = "#ffe082";
            ctx.beginPath();
            ctx.ellipse(384, 250, 40, 16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            pRect(ctx, 396, 228, 3, 28, "#b0bec5"); // Chân micro
            pRect(ctx, 393, 226, 8, 5, "#cfd8dc");
            drawBitmapCharacter(368, 206, {
                genderIndex: kyDuyenOnStage.genderIndex,
                look: kyDuyenOnStage.look,
                outfitIndex: 0,
                outfits: [{ color: kyDuyenOnStage.shirt, shadow: kyDuyenOnStage.shadow, shorts: kyDuyenOnStage.shorts }],
                accessoryIndex: 0,
                accessories: [{ type: kyDuyenOnStage.accessory }]
            }, 'down', 0, false, 1.32);
            const noteFloat = Math.sin(performance.now() / 260) * 4;
            ctx.textAlign = "center";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.fillStyle = "#ffe099";
            ctx.fillText("♪ ♫", 418, 218 + noteFloat);
            ctx.fillText("🎤 Kỳ Duyên · Acoustic", 384, 290);
        } else {
            // Bàn DJ & đĩa xoay cho Neon Bar / Club Mưa Đêm
            pOutlinedRect(ctx, 336, 218, 96, 34, "#1e272e");
            pOutlinedRect(ctx, 348, 224, 22, 22, "#485460");
            pOutlinedRect(ctx, 398, 224, 22, 22, "#485460");
            pRect(ctx, 376, 226, 16, 16, "#00e5ff");
            ctx.textAlign = "center";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.fillStyle = "#ffe099";
            ctx.fillText("🎧 DJ & Sân Khấu", 384, 290);
        }

        // 2. Quầy Bar pha chế bên phải (x = 556..760, y = 198..270)
        pRect(ctx, 560, 204, 204, 72, "rgba(0,0,0,0.28)");
        pOutlinedRect(ctx, 556, 198, 204, 72, "#6a2e98");
        pRect(ctx, 560, 202, 196, 14, "#b84dff");
        pRect(ctx, 560, 218, 196, 4, "rgba(0,0,0,0.22)");
        ctx.textAlign = "center";
        ctx.font = "13px 'Chakra Petch', sans-serif";
        ctx.fillText("🍸 🍹 🍾 🥃", 658, 214);
        // 3 ghế bar cao phía trước quầy
        for (const bx of [586, 650, 714]) {
            pOutlinedRect(ctx, bx, 276, 20, 12, "#d81b60");
        }
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.fillStyle = "#fff6e5";
        ctx.fillText("🍸 Quầy Bar [E]", 658, 250);
        pOutlinedRect(ctx, 578, 292, 160, 20, "rgba(43, 29, 22, 0.78)");
        ctx.font = "bold 11px 'Chakra Petch', sans-serif";
        ctx.fillStyle = "#ffe099";
        ctx.fillText("Gọi đồ: [E] hoặc Click", 658, 306);

        // 3. Hai bàn tròn VIP & ghế sofa bọc nhung hai bên sàn nhảy
        for (const x of [256, 694]) {
            pOutlinedRect(ctx, x - 4, 320, 56, 14, "#7b1e4a"); // Sofa trên
            pOutlinedRect(ctx, x - 4, 376, 56, 14, "#7b1e4a"); // Sofa dưới
            pOutlinedRect(ctx, x + 6, 338, 36, 32, "#3c1d52"); // Bàn VIP
            pRect(ctx, x + 12, 344, 24, 20, "#512b6e");
            pRect(ctx, x + 21, 350, 6, 6, "#ffd54f"); // Nến bàn VIP
        }
    } else if (isTheater) {
        // Sân khấu Nhà Hát lớn phía trên (giữ vùng click 334..666, 198..270)
        pRect(ctx, 250, 198, 500, 74, "rgba(0,0,0,0.32)");
        pOutlinedRect(ctx, 246, 192, 508, 74, "#7a1d30");
        pRect(ctx, 254, 200, 492, 58, "#561826");
        pOutlinedRect(ctx, 246, 192, 36, 74, "#a3223a");
        pOutlinedRect(ctx, 718, 192, 36, 74, "#a3223a");
        pRect(ctx, 498, 212, 4, 26, "#d7ccc8");
        pRect(ctx, 494, 210, 12, 5, "#ffe082");
        pOutlinedRect(ctx, 466, 264, 68, 8, "#c28748");
    } else if (isResidence) {
        // Phòng khách nhà dân / Văn phòng: không vẽ quầy thu ngân
        if (shop.name.includes("VĂN PHÒNG")) {
            pOutlinedRect(ctx, 356, 202, 288, 62, "#546e7a");
            pRect(ctx, 364, 208, 272, 16, "#cfd8dc");
            pOutlinedRect(ctx, 476, 200, 48, 28, "#263238");
            pRect(ctx, 480, 204, 40, 20, "#80deea");
        } else {
            // Tủ gỗ gia đình, đồng hồ quả lắc & tranh phong cảnh
            pOutlinedRect(ctx, 376, 196, 248, 64, "#6d4c41");
            pRect(ctx, 384, 204, 232, 48, "#8d6e63");
            pOutlinedRect(ctx, 464, 206, 72, 34, "#e8f5e9");
            pRect(ctx, 472, 224, 56, 12, "#81c784");
            pOutlinedRect(ctx, 316, 198, 34, 66, "#5d4037");
            pRect(ctx, 325, 208, 16, 16, "#fff8e1");
            // Bộ bàn ghế gỗ tiếp khách & ấm trà ở giữa phòng
            pOutlinedRect(ctx, 434, 336, 132, 56, "#6d4c41");
            pRect(ctx, 444, 344, 112, 40, "#a1887f");
            pOutlinedRect(ctx, 488, 356, 24, 16, "#fff3e0");
            for (const sx of [404, 574]) pOutlinedRect(ctx, sx, 348, 22, 34, "#5d4037");
        }
    } else {
        // Quầy giao dịch / Quầy bếp trung tâm theo từng loại cửa hàng (vùng click 334..666, 198..270)
        pRect(ctx, 338, 204, 332, 72, "rgba(0,0,0,0.22)");
        pOutlinedRect(ctx, 334, 198, 332, 72, accent);
        pRect(ctx, 338, 202, 324, 14, isFoodOrRooftop ? "#ffd8b8" : isBank ? "#e0f2f1" : "#fff1d6");
        pRect(ctx, 338, 218, 324, 4, "rgba(0,0,0,0.18)");

        if (isFoodOrRooftop) {
            // Quầy bếp mở có khay đồ ăn / vỉ nướng rực lửa
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            ctx.fillText(shop.name.includes("NƯỚNG") ? "🔥 🍢 🥩 🔥 🍗 🍤 🔥" : "🍲 🍜 🍗 🍤 🥢 🍺", 500, 215);
            // 4 bàn ăn có món nóng hổi & đũa chén ở hai bên sảnh
            for (const [bx, by] of [[256, 324], [256, 402], [696, 324], [696, 402]]) {
                pOutlinedRect(ctx, bx, by, 52, 38, "#7c4d34");
                pRect(ctx, bx + 5, by + 5, 42, 28, "#fff3e0");
                ctx.font = "14px 'Chakra Petch', sans-serif";
                ctx.fillText(isRooftop ? "🍺" : shop.name.includes("LẨU") ? "🍲" : shop.name.includes("NƯỚNG") ? "🍖" : "🍜", bx + 26, by + 24);
                pOutlinedRect(ctx, bx + 16, by - 11, 20, 9, "#a67c52");
                pOutlinedRect(ctx, bx + 16, by + 40, 20, 9, "#a67c52");
            }
        } else if (isBakeryOrTea) {
            const isTea = shop.name.includes("TRÀ") || shop.name.includes("CHÈ");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            ctx.fillText(isTea ? "🍵 🫖 🌿 🧋 🍯" : "🥐 🍰 🧁 🥖 🍮", 500, 215);
            for (const x of [258, 692]) {
                pOutlinedRect(ctx, x, 334, 48, 38, "#6d4c41");
                pRect(ctx, x + 6, 340, 36, 26, isTea ? "#d7ccc8" : "#fff8e7");
                ctx.fillText(isTea ? "🫖" : "🥐", x + 24, 358);
                pOutlinedRect(ctx, x + 12, 316, 24, 14, isTea ? "#558b2f" : "#c58b67");
                pOutlinedRect(ctx, x + 12, 376, 24, 14, isTea ? "#558b2f" : "#c58b67");
            }
        } else {
            pOutlinedRect(ctx, 352, 200, 26, 20, "#37474f");
            pRect(ctx, 356, 203, 18, 8, "#80cbc4");
            pOutlinedRect(ctx, 620, 200, 24, 20, "#6d4c41");
            pRect(ctx, 624, 194, 16, 8, "#f0b643");
            for (let x = 394; x < 606; x += 36) {
                pOutlinedRect(ctx, x, 204, 16, 14, "#e7ba7a");
            }
            if (isBank) {
                // 2 máy ATM phát sáng bên tường phải
                for (const ax of [698, 738]) {
                    pOutlinedRect(ctx, ax, 326, 30, 52, "#1b4332");
                    pRect(ctx, ax + 5, 333, 20, 14, "#80cbc4");
                    pRect(ctx, ax + 6, 354, 18, 4, "#a3e635");
                }
            } else if (isRepair) {
                // Bàn nâng sửa xe máy & giá lốp xe
                pOutlinedRect(ctx, 250, 334, 68, 46, "#37474f");
                pRect(ctx, 256, 340, 56, 34, "#546e7a");
                ctx.textAlign = "center";
                ctx.font = "18px 'Chakra Petch', sans-serif";
                ctx.fillText("🛵🔧", 284, 363);
                pOutlinedRect(ctx, 688, 334, 58, 46, "#b71c1c");
                ctx.fillText("🛞🧰", 717, 363);
            } else if (!isShowroom) {
                for (const x of [260, 690]) {
                    pRect(ctx, x + 3, 335, 48, 42, "rgba(0,0,0,0.18)");
                    pOutlinedRect(ctx, x, 331, 48, 42, accent);
                    pRect(ctx, x + 6, 337, 36, 30, "#fff5e1");
                    pRect(ctx, x + 18, 346, 12, 10, "#6f4e37");
                    pOutlinedRect(ctx, x + 14, 314, 20, 13, "#b78765");
                    pOutlinedRect(ctx, x + 14, 378, 20, 13, "#b78765");
                }
            }
        }
    }

    // Nội thất đặc trưng cho Showroom / Thời trang / Đọc sách / Trang sức
    if (isShowroom) {
        for (const [index, color] of ["#b64b52", "#598fb0", "#dfaf55"].entries()) {
            const x = 323 + index * 125;
            pOutlinedRect(ctx, x - 6, 382, 111, 10, "#90a4ae");
            pOutlinedRect(ctx, x, 347, 99, 36, color);
            pOutlinedRect(ctx, x + 23, 335, 52, 16, "#759eaa");
            for (const offset of [12, 71]) pOutlinedRect(ctx, x + offset, 374, 16, 12, "#241d26");
        }
    }
    if (isFashion) {
        for (const [index, color] of ["#6b4f8c", "#f3d6a3", "#a96457"].entries()) {
            const x = 360 + index * 106;
            pRect(ctx, x + 18, 335, 3, 48, "#624c48");
            pOutlinedRect(ctx, x, 342, 40, 25, color);
            pRect(ctx, x + 9, 379, 22, 4, "#624c48");
        }
        pOutlinedRect(ctx, 698, 215, 42, 78, "#a7c3c5");
        pRect(ctx, 705, 224, 4, 48, "#e1efdc");
    }
    if (isBookOrAntique) {
        for (const bx of [376, 566]) {
            pOutlinedRect(ctx, bx, 326, 58, 26, "#5d4037");
            ctx.textAlign = "center";
            ctx.font = "14px 'Chakra Petch', sans-serif";
            ctx.fillText(shop.name.includes("ĐỒ CỔ") ? "🏺🕰️" : "📚📖", bx + 29, 344);
        }
    }

    // Khách / NPC đang có mặt trong quán
    floorVisitors.forEach((npc, index) => {
        const x = getShopVisitorX(index, floorVisitors.length);
        drawBitmapCharacter(x, 401, { genderIndex: npc.genderIndex, look: npc.look, outfitIndex: 0,
            outfits: [{ color: npc.shirt, shadow: npc.shadow, shorts: npc.shorts }],
            accessoryIndex: 0, accessories: [{ type: npc.accessory || 'none' }] }, 'down', 0, false, 1.4);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff3d6";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(npc.name, x + 16, 398, 115);
    });

    // Nhân vật của người chơi đi lại bình thường
    drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
    drawPlayerNameLabel(player.x, player.y);

    // Chữ hướng dẫn trên quầy & nút Ra ngoài [Q] (giữ nguyên vùng click 431..569, 501..533)
    if (!isNight && !isResidence) {
        ctx.textAlign = "center";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillStyle = "#fff6e5";
        ctx.fillText(isTheater ? "🎭 Sân khấu Nhà Hát" : shop.market ? "🛒 Mua nguyên liệu" : shop.bikes ? "🚲 Thuê xe đạp" :
            shop.rental ? (businesses[shop.rental.id]?.type.id !== "cafe" && businesses[shop.rental.id] ? "📊 Xem lãi cửa hàng" : "☕ Pha chế và bán cà phê") : shop.name.includes("TIỆM MAY") ? "🧵 Đặt may và thử đồ" : shop.menu ? "🛍️ Xem món bán" : "✨ Quầy tiếp khách", 500, 249);

        pOutlinedRect(ctx, 412, 276, 176, 22, "rgba(43, 29, 22, 0.72)");
        ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
        ctx.fillStyle = "#ffe099";
        ctx.fillText(isTheater ? "Sân khấu biểu diễn" : "Đến quầy nhấn [E] hoặc Click", 500, 291);
    }

    pOutlinedRect(ctx, 431, 501, 138, 32, accent);
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#fff6e5";
    ctx.fillText("🚪 Ra ngoài [Q]", 500, 522);
    if (shop.rental) {
        pOutlinedRect(ctx, 582, 501, 152, 32, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
        ctx.fillText("⚙️ Quản lý quán [K]", 658, 522);
    }

    drawMinimalHUD(shop.name);
    drawGuideCompassAndBeacon();
    if (showShopMenu) drawShopMenu();
    if(showManagementModal) drawManagementModal();
    if(showBankModal) drawBankModal();
    drawDialogueModal();
    drawMarketModal();
    drawBrewModal();
    drawSleepSummaryModal();
    drawToastOverlay();
    drawScreenPopups();
}

function drawFreestandingBuilding(c, zid, x, y, w, h, opts = {}) {
    const wallCol = opts.wallCol || PAL.WALL_OCHRE;
    const wallDark = opts.wallDark || PAL.WALL_OCHRE_DARK;
    const wallLight = opts.wallLight || "#f5d6a7";
    const roofLight = opts.roofLight || PAL.ROOF_TILE_LIGHT;
    const roofDark = opts.roofDark || PAL.ROOF_TILE_DARK;
    const awning1 = opts.awning1 || PAL.AWNING_GREEN;
    const awning2 = opts.awning2 || PAL.AWNING_CREAM;
    const gateCol = opts.gateCol || PAL.SHUTTER_GREEN;
    const title = opts.title || "";
    const subTitle = opts.subTitle || "";
    const signBg = opts.signBg || PAL.SIGN_RED;
    const signBorder = opts.signBorder || PAL.SIGN_YELLOW;

    // Khoảng sân lát gạch ấm áp quanh căn nhà (nhân vật đi lên thoải mái)
    pOutlinedRect(c, x - 28, y + h - 10, w + 56, 70, "#d9c8b2");
    for (let px = x - 20; px < x + w + 20; px += 28) {
        pRect(c, px, y + h, 24, 24, "#cbb89f");
        pRect(c, px, y + h + 28, 24, 24, "#e6d7c3");
    }

    // Bóng đổ ngôi nhà
    pRect(c, x + 8, y + 12, w + 6, h + 6, "rgba(43, 29, 22, 0.32)");

    // Tường & Mái ngói
    drawWeatheredWall(c, x, y, w, h, wallCol, wallDark, wallLight);
    // Gờ chỉ, trụ góc và bệ cửa tạo khối mặt tiền kiểu nhà phố Sài Gòn.
    pRect(c, x + 3, y + 7, w - 6, 5, wallLight);
    pRect(c, x + 5, y + 13, 5, h - 25, wallDark);
    pRect(c, x + w - 10, y + 13, 5, h - 25, wallLight);
    pRect(c, x + 8, y + h - 14, w - 16, 4, "#f2d9b4");
    drawTiledRoof(c, x - 6, y - 16, w + 12, 24, roofLight, roofDark);

    // Cửa sổ tầng trên
    drawShutteredWindow(c, x + 22, y + 20, 44, 34);
    if (w >= 210) {
        drawShutteredWindow(c, x + w - 66, y + 20, 44, 34);
    }

    // Mái hiên & Bảng hiệu (đặt gọn phía trên, chừa khoảng trống cho cửa cuốn)
    drawStripedAwning(c, x + 4, y + 60, w - 8, 20, awning1, awning2);
    if (title) {
        drawRentalStorefrontSign(c, x + 14, y + 46, w - 28, title, subTitle, signBg, signBorder);
    }

    // Cửa chính (giới hạn chiều cao để không bao giờ che mất bảng hiệu)
    const gateW = Math.min(140, w - 56);
    const gateH = Math.min(54, Math.max(40, h - 102));
    const gateY = y + h - gateH;
    pRect(c, x + (w - gateW) / 2 - 7, gateY - 4, gateW + 14, 5, wallLight);
    drawFoldingGate(c, x + (w - gateW) / 2, gateY, gateW, gateH, gateCol, PAL.SHUTTER_DARK);
    if (zid && !title.includes('NHÀ CỦA TÔI')) registerShop(zid, title, x, y, w, h, gateW);

    // Chậu cây cảnh hai bên cửa
    drawTerracottaPlant(c, x + 14, y + h - 4, 1.35);
    drawTerracottaPlant(c, x + w - 14, y + h - 4, 1.35);

    // Đăng ký vùng va chạm cho thân nhà (chừa phần hiên dưới để nhân vật đứng sát cửa)
    if (zid) {
        addCollider(zid, x, y - 10, w, h - 8);
    }
}

function drawHospitalBuilding(c, zid, x, y, w, h) {
    // Sân lát gạch y tế rộng phía trước & bãi đỗ xe cứu thương bên hông
    pOutlinedRect(c, x - 24, y + h - 12, w + 128, 72, "#d8e2e6");
    for (let px = x - 16; px < x + w + 92; px += 30) {
        pRect(c, px, y + h - 2, 24, 24, "#c7d6dc");
        pRect(c, px, y + h + 26, 24, 24, "#e6eef1");
    }

    // Bóng đổ tòa nhà bệnh viện
    pRect(c, x + 10, y + 14, w + 8, h + 6, "rgba(28, 42, 52, 0.34)");

    // Khối nhà chính 2 tầng màu trắng xanh y tế
    drawWeatheredWall(c, x, y, w, h, "#f2f7f9", "#d4e2e8", "#ffffff");
    pRect(c, x, y, w, 16, "#2b7a9b");
    pRect(c, x + 4, y + 16, w - 8, 6, "#d7e8ef");
    pRect(c, x + 6, y + 22, 8, h - 34, "#d4e2e8");
    pRect(c, x + w - 14, y + 22, 8, h - 34, "#ffffff");

    // Khối chữ thập đỏ nổi bật trên nóc sảnh chính
    const crossBoxW = 72;
    const crossBoxH = 44;
    const crossX = x + Math.round((w - crossBoxW) / 2);
    const crossY = y - 34;
    pOutlinedRect(c, crossX, crossY, crossBoxW, crossBoxH, "#ffffff");
    pRect(c, crossX + 4, crossY + 4, crossBoxW - 8, crossBoxH - 8, "#e6f2f6");
    pRect(c, crossX + 30, crossY + 9, 12, 26, "#d9383a");
    pRect(c, crossX + 23, crossY + 16, 26, 12, "#d9383a");

    // Dãy cửa sổ kính 2 tầng
    for (let wx = x + 26; wx <= x + w - 74; wx += 64) {
        pOutlinedRect(c, wx, y + 32, 42, 34, "#2b5b73");
        pRect(c, wx + 4, y + 36, 34, 26, "#9ed5ea");
        pRect(c, wx + 20, y + 36, 3, 26, "#2b5b73");
        pRect(c, wx + 8, y + 40, 8, 10, "rgba(255,255,255,0.45)");
        if (wx < x + w / 2 - 80 || wx > x + w / 2 + 45) {
            pOutlinedRect(c, wx, y + 120, 42, 34, "#2b5b73");
            pRect(c, wx + 4, y + 124, 34, 26, "#9ed5ea");
            pRect(c, wx + 20, y + 124, 3, 26, "#2b5b73");
        }
    }

    // Mái sảnh cấp cứu & bảng hiệu bệnh viện
    drawStripedAwning(c, x + w / 2 - 115, y + 86, 230, 20, "#2b7a9b", "#ffffff");
    drawRentalStorefrontSign(
        c, x + 46, y + 70, w - 92,
        "🏥 BỆNH VIỆN ĐA KHOA SÀI GÒN",
        "Cấp Cứu & Hồi Sức 24/24",
        "#1f5c78", "#ffffff"
    );

    // Cửa kính tự động sảnh chính
    const gateW = 140;
    const gateH = 62;
    const gateX = x + Math.round((w - gateW) / 2);
    const gateY = y + h - gateH;
    pOutlinedRect(c, gateX - 6, gateY - 6, gateW + 12, gateH + 6, "#2b5b73");
    pRect(c, gateX, gateY, gateW, gateH, "#8ac6dd");
    pRect(c, gateX + gateW / 2 - 2, gateY, 4, gateH, "#2b5b73");
    pRect(c, gateX + 10, gateY + 10, 18, 36, "rgba(255,255,255,0.35)");
    pRect(c, gateX + gateW / 2 + 12, gateY + 10, 18, 36, "rgba(255,255,255,0.35)");

    // Chậu cây xanh hai bên sảnh
    drawTerracottaPlant(c, gateX - 24, y + h - 4, 1.45);
    drawTerracottaPlant(c, gateX + gateW + 24, y + h - 4, 1.45);

    // Xe cứu thương đậu bên hông bệnh viện
    const ambX = x + w + 18;
    const ambY = y + h - 54;
    pRect(c, ambX + 4, ambY + 42, 74, 10, "rgba(0,0,0,0.24)");
    pOutlinedRect(c, ambX, ambY + 10, 62, 34, "#ffffff");
    pOutlinedRect(c, ambX + 60, ambY + 18, 22, 26, "#ffffff");
    pRect(c, ambX + 64, ambY + 21, 14, 11, "#7cc6e2");
    pRect(c, ambX + 2, ambY + 28, 78, 4, "#d9383a");
    pRect(c, ambX + 26, ambY + 15, 6, 12, "#d9383a");
    pRect(c, ambX + 23, ambY + 18, 12, 6, "#d9383a");
    pRect(c, ambX + 24, ambY + 4, 14, 6, "#3b9ad9");
    pOutlinedRect(c, ambX + 10, ambY + 40, 12, 12, "#2c3038");
    pOutlinedRect(c, ambX + 62, ambY + 40, 12, 12, "#2c3038");

    if (zid) {
        registerShop(zid, "🏥 BỆNH VIỆN ĐA KHOA SÀI GÒN", x, y, w, h, gateW);
        addCollider(zid, x, y - 10, w, h - 8);
        addCollider(zid, ambX, ambY + 8, 82, 42);
    }
}

// ============================================================================
// XÂY DỰNG BẢN ĐỒ MỞ RỘNG 2000x1400 CHO 10 KHU PHỐ (THOÁNG ĐÃNG KIỂU STARDEW VALLEY)
// ============================================================================

const homeBgCanvas = document.createElement('canvas');
homeBgCanvas.width = canvas.width;
homeBgCanvas.height = canvas.height;
const homeBgCtx = homeBgCanvas.getContext('2d');
homeBgCtx.imageSmoothingEnabled = false;

const zoneCanvases = {};
Object.keys(GAME_CONFIG.ZONES).forEach((zid) => {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const zctx = cv.getContext('2d');
    zctx.imageSmoothingEnabled = false;
    zoneCanvases[zid] = cv;
    zoneColliders[zid] = [];
});

function buildHomeBackground() {
    const c = homeBgCtx;
    pRect(c, 0, 0, canvas.width, canvas.height, "#1f1611");
    c.save();
    c.translate(145, 70);
    c.scale(0.71, 0.71);
    pOutlinedRect(c, 74, 74, 852, 502, "#5c4033");

    for (let y = 80; y < 568; y += 32) {
        for (let x = 80; x < 918; x += 32) {
            const isAlt = ((x / 32) + (y / 32)) % 2 === 0;
            pRect(c, x, y, 32, 32, isAlt ? "#e8d3b5" : "#d9be98");
            pRect(c, x, y, 32, 2, "#b59670");
            pRect(c, x, y, 2, 32, "#b59670");
            pRect(c, x + 12, y + 12, 8, 8, isAlt ? "#c84b31" : "#5f7a61");
            pRect(c, x + 14, y + 14, 4, 4, "#e8d3b5");
        }
    }

    pOutlinedRect(c, 80, 52, 840, 36, PAL.WALL_OCHRE);
    pOutlinedRect(c, 440, 56, 120, 28, PAL.SHUTTER_GREEN);
    for (let wy = 62; wy < 80; wy += 5) {
        pRect(c, 446, wy, 50, 2, PAL.SHUTTER_DARK);
        pRect(c, 504, wy, 50, 2, PAL.SHUTTER_DARK);
    }

    // Giường ngủ (x=100, y=100, w=92, h=132) - Nơi nghỉ ngơi kết thúc ngày
    pRect(c, 104, 106, 94, 132, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 100, 100, 92, 132, "#6e4736");
    pOutlinedRect(c, 106, 108, 80, 116, "#c84b31");
    pOutlinedRect(c, 112, 112, 68, 34, "#ecd3ab");
    pOutlinedRect(c, 106, 154, 80, 70, "#d99b4e");

    // Tủ lạnh & Bàn pha chế thử tại nhà
    pRect(c, 814, 106, 74, 102, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 810, 100, 72, 100, PAL.WALL_MINT);
    pRect(c, 812, 140, 68, 4, PAL.OUTLINE);
    pRect(c, 818, 118, 4, 16, PAL.OUTLINE);
    pRect(c, 818, 150, 4, 22, PAL.OUTLINE);

    // Bàn máy tính xem sổ sách
    pRect(c, 104, 326, 56, 84, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 100, 320, 54, 82, "#8c5d47");
    pOutlinedRect(c, 106, 330, 42, 52, "#333942");
    pOutlinedRect(c, 112, 342, 30, 26, "#58a6ff");

    pOutlinedRect(c, 230, 100, 110, 52, "#8c5d47");
    pOutlinedRect(c, 250, 110, 18, 22, PAL.CART_STEEL);
    pOutlinedRect(c, 280, 112, 16, 20, "#4f8a46");
    drawTerracottaPlant(c, 770, 130);

    // Thảm & Cửa ra phố
    pOutlinedRect(c, 440, 526, 120, 30, "#b85d38");
    pOutlinedRect(c, 430, 558, 140, 16, PAL.SHUTTER_GREEN);
    for (let dx = 438; dx < 564; dx += 10) {
        pRect(c, dx, 560, 3, 12, PAL.OUTLINE);
    }
    c.restore();
}

// Hàm vẽ nền đất công viên/sân cỏ rộng lớn 2000x1400 có đường phố và vỉa hè thoáng đãng
function drawOpenWorldBase(c, zid, grassCol1, grassCol2, sidewalkCol, roadCol) {
    const conn = GAME_CONFIG.ZONES[zid].connections || {};

    // 1. Thảm cỏ tự nhiên hoặc sân đất rộng thoáng khắp bản đồ 2000x1400
    pRect(c, 0, 0, WORLD_W, WORLD_H, grassCol1);
    for (let y = 0; y < WORLD_H; y += 36) {
        for (let x = 0; x < WORLD_W; x += 44) {
            if (((x / 44 + y / 36) % 3) === 0) {
                pRect(c, x, y, 28, 18, grassCol2);
            }
            if (((x * 7 + y * 13) % 17) === 0) {
                pRect(c, x + 8, y + 6, 8, 6, "#7bb357");
            }
            const tuft = (x * 13 + y * 5 + zid.length * 11) % 29;
            if (tuft === 4 || tuft === 17) {
                pRect(c, x + 5, y + 18, 3, 5, "#4e8544");
                pRect(c, x + 9, y + 14, 3, 9, grassCol2);
                pRect(c, x + 13, y + 17, 3, 6, "#80b75a");
                if (tuft === 17) pRect(c, x + 16, y + 13, 3, 3, "#f2d58c");
            }
        }
    }

    if (zid === 'PARK') return;

    // Lát sân trước, sau đó vẽ đường để lối dạo không phủ lên ngã rẽ.
    pOutlinedRect(c, 180, 220, 1640, 230, sidewalkCol);
    pOutlinedRect(c, 180, 750, 1640, 340, sidewalkCol);

    // 2. Quảng trường & Vỉa hè lát gạch rộng rãi dọc theo đường chính (y = 430..770)
    pOutlinedRect(c, 0, 440, WORLD_W, 320, sidewalkCol);
    for (let y = 444; y < 756; y += 28) {
        for (let x = 0; x < WORLD_W; x += 36) {
            pRect(c, x, y, 36, 2, "rgba(43, 29, 22, 0.14)");
            pRect(c, x, y, 2, 28, "rgba(43, 29, 22, 0.14)");
        }
    }

    const branchLeft = 920;
    const branchWidth = 160;
    const branchRight = branchLeft + branchWidth;
    const roadTop = 516;
    const roadBottom = 684;
    const curbColor = "#c7b8aa";

    // Lề ngang chừa miệng đường nhánh, lề dọc dừng ở đường chính.
    for (const [hasBranch, curbY, startY, endY] of [
        [conn.up, roadTop - 8, 0, roadTop],
        [conn.down, roadBottom, roadBottom, WORLD_H]
    ]) {
        if (!hasBranch) {
            pRect(c, 0, curbY, WORLD_W, 8, curbColor);
            continue;
        }
        pRect(c, branchLeft - 40, startY, branchWidth + 80, endY - startY, sidewalkCol);
        pRect(c, 0, curbY, branchLeft, 8, curbColor);
        pRect(c, branchRight, curbY, WORLD_W - branchRight, 8, curbColor);
        pRect(c, branchLeft - 8, startY, 8, endY - startY, curbColor);
        pRect(c, branchRight, startY, 8, endY - startY, curbColor);
        pRect(c, branchLeft, startY, branchWidth, endY - startY, roadCol);

        const crossingY = startY === 0 ? roadTop - 34 : roadBottom + 10;
        for (let x = branchLeft + 12; x < branchRight - 12; x += 20) {
            pRect(c, x, crossingY, 12, 24, "#ecd3ab");
        }
    }

    pRect(c, 0, roadTop, WORLD_W, roadBottom - roadTop, roadCol);
    // Đá dăm, miếng vá nhựa và rãnh thoát nước để mặt đường bớt phẳng lì.
    for (let y = roadTop + 14; y < roadBottom - 12; y += 27) {
        for (let x = 18; x < WORLD_W - 18; x += 43) {
            const mark = (x * 7 + y * 11 + zid.length * 19) % 41;
            if (mark === 3 || mark === 12) pRect(c, x, y, mark === 3 ? 5 : 3, 2, "rgba(228, 207, 175, 0.22)");
            if (mark === 25) pRect(c, x, y, 9, 3, "rgba(45, 43, 44, 0.22)");
        }
    }
    for (let x = 40; x < WORLD_W - 40; x += 72) {
        if ((conn.up || conn.down) && x < branchRight && x + 42 > branchLeft) continue;
        pOutlinedRect(c, x, 596, 42, 8, PAL.ROAD_LINE);
    }

    for (const drainX of [310, 790, 1235, 1710]) {
        pOutlinedRect(c, drainX, roadTop + 8, 28, 8, "#46484a");
        for (let slot = drainX + 4; slot < drainX + 26; slot += 5) pRect(c, slot, roadTop + 10, 2, 4, "#a2a19a");
    }
    for (const manholeX of [525, 1485]) {
        pOutlinedRect(c, manholeX, 637, 28, 16, "#55504c");
        pRect(c, manholeX + 5, 641, 18, 2, "#888078");
        pRect(c, manholeX + 8, 646, 12, 2, "#393635");
    }

    // Đèn đường cổ điển dọc đại lộ
    [220, 640, 1140, 1620].forEach((lx) => {
        drawStreetLamp(c, lx, 495);
        drawStreetLamp(c, lx, 710);
    });
}

function buildAllZonesOpenWorld() {
    // 1. KHU PHỐ NHÀ MÌNH (HOME_STREET) - Thoáng đãng, có Sân Hẻm 54, Xe Đẩy Cà Phê Khởi Nghiệp & Chợ Sớm Cô Ba
    {
        const zid = 'HOME_STREET';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#6e9e56", "#5d8c47", PAL.SIDEWALK_LIGHT, PAL.ROAD_ASPHALT);

        // Căn 1: Mặt Bằng Hẻm 54 (r1: x=280, y=250, w=230, h=175)
        const r1 = GAME_CONFIG.RENTALS.HOME_STREET[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: PAL.WALL_OCHRE, wallDark: PAL.WALL_OCHRE_DARK,
            title: "🏠 MẶT BẰNG HẺM 54", subTitle: "4.500.000đ / tháng"
        });

        // Nhà nhỏ của người chơi, cửa hướng ra sân Hẻm 54
        drawFreestandingBuilding(c, zid, 875, 300, 140, 125, {
            wallCol: PAL.WALL_CREAM, wallDark: "#cfb28a",
            awning1: "#d9c2a3", awning2: "#bda282",
            title: "🏡 NHÀ CỦA TÔI (HẺM 54)", subTitle: "Cửa về phòng ngủ",
            signBg: "#3b6e8c", signBorder: "#ecd3ab"
        });

        for (const [x, y, color] of [
            [525, 275, "#d6a777"], [626, 260, "#a8b89a"], [727, 278, "#d4a2a0"],
            [1030, 278, "#a8b7c1"], [1131, 266, "#d8b88c"], [1232, 278, "#bfc99c"],
            [460, 810, "#c5aa91"], [562, 810, "#a9afb7"], [664, 835, "#cf9d83"],
            [1120, 825, "#d6b590"], [1222, 805, "#a9bb92"], [1324, 810, "#d5a5a0"]
        ]) {
            drawFreestandingBuilding(c, zid, x, y, 96, 115, { wallCol: color, wallDark: "#9d7b68" });
        }

        // Xe đẩy Cà Phê 5AM giờ được vẽ động (có thể đẩy đi khu khác bằng phím [G])
        // Đặt 2 ghế đẩu gỗ nhỏ làm điểm nghỉ ở sân Hẻm 54
        pOutlinedRect(c, 1076, 405, 24, 20, "#b87939");
        pOutlinedRect(c, 1212, 405, 24, 20, "#b87939");

        // Căn 3: Mặt Bằng Ngã Tư Hẻm (r2: x=1380, y=250, w=240, h=175)
        const r2 = GAME_CONFIG.RENTALS.HOME_STREET[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: PAL.WALL_GOLD, wallDark: "#b87b38",
            title: "🏢 MẶT BẰNG NGÃ TƯ", subTitle: "6.500.000đ / tháng"
        });

        // Phía Nam: SẠP TẠP HÓA CÔ BA (CHỢ SỚM) (x=760, y=820, w=340, h=175)
        drawFreestandingBuilding(c, zid, 760, 820, 340, 175, {
            wallCol: "#d4ab79", wallDark: "#b38959",
            awning1: "#c97b4b", awning2: "#f0b643",
            title: "🛒 TIỆM TẠP HÓA CÔ BA (CHỢ SỚM)", subTitle: "Nguyên liệu pha chế | Giảm 20% trước 8h sáng",
            signBg: "#4f8a46", signBorder: "#f0b643"
        });

        // Các rổ trái cây, hạt cà phê, sữa đặc trưng bày trước chợ Cô Ba
        [780, 850, 920, 990].forEach((bx, idx) => {
            pOutlinedRect(c, bx, 1002, 54, 24, "#a6754b");
            pOutlinedRect(c, bx + 6, 994, 42, 14, idx % 2 === 0 ? "#e88a38" : "#7bb357");
        });

        // Cây cổ thụ bóng mát, ghế đá & sân cỏ rộng rãi hai bên để nhân vật dạo chơi
        drawShadeTree(c, 150, 360, 1.1);
        drawShadeTree(c, 670, 370, 1.05, "#ff77a9");
        drawShadeTree(c, 1760, 360, 1.15);
        drawShadeTree(c, 380, 950, 1.2);
        drawShadeTree(c, 1420, 960, 1.2, "#f0b643");
        drawParkBench(c, 640, 420);
        drawParkBench(c, 1380, 1010);
        drawParkedScooter(c, 770, 415, "#3e6b89", true, 1.5, false);
    }

    // 2. KHU PHỐ ĐẮT HƠN (BETTER_STREET)
    {
        const zid = 'BETTER_STREET';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#669c58", "#548747", "#cfc0b0", "#5e5652");

        // Tiệm Bánh Pháp L'Amour
        drawFreestandingBuilding(c, zid, 260, 240, 260, 180, {
            wallCol: "#f2dfc4", wallDark: "#d9c09e",
            awning1: "#c84b31", awning2: "#fff3d6",
            title: "🥐 TIỆM BÁNH PHÁP L'AMOUR", subTitle: "Croissant & Bánh Ngọt",
            signBg: "#6e4736", signBorder: "#f0b643"
        });

        // Mặt Bằng 1: Phố Thịnh Vượng
        const r1 = GAME_CONFIG.RENTALS.BETTER_STREET[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#d4e0d2", wallDark: "#b0c2ae",
            title: "🏠 MẶT BẰNG THỊNH VƯỢNG", subTitle: "8.500.000đ / tháng"
        });

        // Hiệu Sách & Dược Phẩm
        drawFreestandingBuilding(c, zid, 1340, 240, 260, 180, {
            wallCol: "#e8dec8", wallDark: "#c9bba1",
            awning1: "#3b78b8", awning2: "#e8f1f5",
            title: "📚 HIỆU SÁCH NHÀ NAM", subTitle: "Sách Hay & Tạp Chí",
            signBg: "#29568f", signBorder: "#ffffff"
        });

        // Mặt Bằng 2: Góc Phố Mới (Phía Nam)
        const r2 = GAME_CONFIG.RENTALS.BETTER_STREET[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: PAL.WALL_OCHRE, wallDark: PAL.WALL_OCHRE_DARK,
            title: "🏢 MẶT BẰNG GÓC PHỐ MỚI", subTitle: "11.000.000đ / tháng"
        });

        // Bệnh Viện Đa Khoa Sài Gòn (Góc dưới trái khu Phố Đắt Hơn)
        drawHospitalBuilding(c, zid, BETTER_HOSPITAL.x, BETTER_HOSPITAL.y, BETTER_HOSPITAL.w, BETTER_HOSPITAL.h);

        drawShadeTree(c, 640, 360, 1.15, "#ff77a9");
        drawShadeTree(c, 1160, 360, 1.15);
        drawShadeTree(c, 815, 940, 1.25);
        drawParkBench(c, 785, 990);
    }

    // 3. TRUNG TÂM SẦM UẤT (DOWNTOWN)
    {
        const zid = 'DOWNTOWN';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#598c58", "#4b7a4a", "#d6cec2", "#504b48");

        drawFreestandingBuilding(c, zid, 180, 230, 280, 180, {
            wallCol: "#2c3038", wallDark: "#1f2229",
            title: "👗 SAIGON CHIC BOUTIQUE", subTitle: "Thời Trang Cao Cấp",
            signBg: "#16191f", signBorder: "#d4af37"
        });

        const r1 = GAME_CONFIG.RENTALS.DOWNTOWN[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#f5e6c8", wallDark: "#d9c398",
            title: "💎 KIOT ĐẠI LỘ MUA SẮM", subTitle: "22.000.000đ / tháng"
        });

        drawFreestandingBuilding(c, zid, 1220, 230, 340, 180, {
            wallCol: "#242b35", wallDark: "#181d24",
            title: "🏎️ SHOWROOM SIÊU XE SÀI GÒN", subTitle: "Luxury Auto & Motor",
            signBg: "#96281b", signBorder: "#f1c40f"
        });

        const r2 = GAME_CONFIG.RENTALS.DOWNTOWN[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: "#e8d5b5", wallDark: "#cbb289",
            title: "👑 MẶT BẰNG VÀNG TRUNG TÂM", subTitle: "30.000.000đ / tháng"
        });

        drawShadeTree(c, 490, 940, 1.2);
        drawShadeTree(c, 1680, 940, 1.2);
    }

    // 4. KHU VĂN PHÒNG (OFFICE_DISTRICT)
    {
        const zid = 'OFFICE_DISTRICT';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#5c8f62", "#4d7c52", "#cfd6dc", "#4b5259");

        drawFreestandingBuilding(c, zid, 200, 220, 280, 190, {
            wallCol: "#34495e", wallDark: "#2c3e50",
            title: "🏢 CAO ỐC SAIGON TOWER", subTitle: "Trung Tâm Thương Mại & Công Sở",
            signBg: "#1b2631", signBorder: "#5dade2"
        });

        const r1 = GAME_CONFIG.RENTALS.OFFICE_DISTRICT[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#dfe6e9", wallDark: "#b2bec3",
            title: "☕ MẶT BẰNG SẢNH CAO ỐC", subTitle: "17.500.000đ / tháng",
            signBg: "#1f618d", signBorder: "#f1c40f"
        });

        drawFreestandingBuilding(c, zid, 1220, 220, 280, 190, {
            wallCol: "#ebf5fb", wallDark: "#aed6f1",
            title: "🏦 NGÂN HÀNG VIETBANK 24/7", subTitle: "Giao Dịch Tài Chính & ATM",
            signBg: "#154360", signBorder: "#f4d03f"
        });

        const r2 = GAME_CONFIG.RENTALS.OFFICE_DISTRICT[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: "#d5dbdb", wallDark: "#95a5a6",
            title: "🏛️ MẶT BẰNG PHỐ TÀI CHÍNH", subTitle: "24.000.000đ / tháng"
        });

        drawShadeTree(c, 520, 940, 1.2);
        drawParkBench(c, 490, 990);
    }

    // 5. CÔNG VIÊN XANH (PARK)
    {
        const zid = 'PARK';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#589e47", "#498739", "#d9c8b2", "#bfab91");

        pOutlinedRect(c, 180, 920, 520, 260, "#879281");
        pOutlinedRect(c, 192, 932, 496, 236, "#438fac");
        for (const [x, y] of [[245, 986], [375, 1056], [500, 985], [625, 1110]]) {
            pOutlinedRect(c, x, y, 28, 16, "#429955");
            pRect(c, x + 8, y - 5, 10, 10, "#fd79a8");
        }
        addCollider(zid, 180, 920, 520, 260);

        // Lối đi bộ nối ba cổng vào quảng trường giữa thảm cỏ.
        pRect(c, 965, 0, 70, WORLD_H, "#d2b993");
        pRect(c, 0, 567, 620, 70, "#d2b993");
        pOutlinedRect(c, 610, 480, 780, 380, "#cfb99b");
        for (let x = 622; x < 1385; x += 34) pRect(c, x, 487, 1, 366, "#b49d80");
        for (let y = 491; y < 853; y += 32) pRect(c, 618, y, 764, 1, "#b49d80");
        pOutlinedRect(c, 864, 495, 272, 27, "#ecd3ab");
        c.textAlign = "center";
        c.fillStyle = PAL.OUTLINE;
        c.font = "bold 15px 'Chakra Petch', sans-serif";
        c.fillText("QUẢNG TRƯỜNG CÔNG VIÊN", 1000, 514);

        pOutlinedRect(c, 250, 236, 310, 170, "#dfbd79");
        pRect(c, 280, 251, 124, 7, "#a35047");
        pRect(c, 280, 251, 6, 91, "#a35047");
        pRect(c, 398, 251, 6, 91, "#a35047");
        for (const x of [304, 358]) {
            pRect(c, x, 258, 2, 52, "#654e43");
            pRect(c, x + 20, 258, 2, 52, "#654e43");
            pOutlinedRect(c, x - 3, 309, 28, 8, "#476d7f");
        }
        pOutlinedRect(c, 425, 255, 46, 55, "#cb654a");
        pOutlinedRect(c, 425, 300, 12, 52, "#668b61");
        for (let step = 0; step < 12; step++) {
            pRect(c, 463 + step * 5, 275 + step * 5, 19, 8, "#507fa4");
        }
        addCollider(zid, 280, 251, 124, 77);
        addCollider(zid, 425, 255, 100, 78);

        [180, 740, 1180, 1740].forEach((tx) => drawShadeTree(c, tx, 360, 1.2, "#ff77a9"));
        [1300, 1620].forEach((tx) => drawShadeTree(c, tx, 940, 1.25));
        drawParkBench(c, 720, 410);
        drawParkBench(c, 1340, 990);
    }

    // 6. QUẬN 1 - PHỐ ĐÊM (DISTRICT_1)
    {
        const zid = 'DISTRICT_1';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#342e3d", "#282330", "#463f52", "#231f29");

        drawFreestandingBuilding(c, zid, 180, 230, 280, 180, {
            wallCol: "#271c38", wallDark: "#191324",
            title: "🍸 SKYLINE CLUB & LOUNGE", subTitle: "Phố Đêm Không Ngủ",
            signBg: "#8e44ad", signBorder: "#00f7ff"
        });

        const r1 = GAME_CONFIG.RENTALS.DISTRICT_1[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#2c2238", wallDark: "#191324",
            title: "🔥 MẶT BẰNG PHỐ ĐÊM Q.1", subTitle: "28.000.000đ / tháng",
            signBg: "#c0392b", signBorder: "#00f7ff"
        });

        const r2 = GAME_CONFIG.RENTALS.DISTRICT_1[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: "#24172b", wallDark: "#150d1a",
            title: "💎 GÓC VÀNG PHỐ ĐÊM Q.1", subTitle: "35.000.000đ / tháng",
            signBg: "#96281b", signBorder: "#f1c40f"
        });
    }

    // 7. KHU NGƯỜI GIÀ - PHỐ CỔ HOA GIẤY (ELDERLY_AREA)
    {
        const zid = 'ELDERLY_AREA';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#6e9458", "#5d8248", "#d9ccb8", "#635a52");

        drawFreestandingBuilding(c, zid, 180, 230, 260, 180, {
            wallCol: "#dfc496", wallDark: "#bfa06f",
            title: "🍵 AN LẠC TRÀ ĐẠO & ĐÔNG Y", subTitle: "Thảo Dược Cổ Truyền",
            signBg: "#4a2c18", signBorder: "#f0b643"
        });

        const r1 = GAME_CONFIG.RENTALS.ELDERLY_AREA[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#e8be7b", wallDark: "#c99b53",
            title: "🌺 MẶT BẰNG PHỐ CỔ HOA GIẤY", subTitle: "16.000.000đ / tháng",
            signBg: "#6e3d1e", signBorder: "#f0b643"
        });

        const r2 = GAME_CONFIG.RENTALS.ELDERLY_AREA[1];
        drawFreestandingBuilding(c, zid, r2.x, r2.y, r2.w, r2.h, {
            wallCol: "#f0d29c", wallDark: "#cfb076",
            title: "🏛️ BIỆT THỰ CỔ MẶT TIỀN", subTitle: "21.000.000đ / tháng",
            signBg: "#5c341d", signBorder: "#f0b643"
        });

        // Sân cờ tướng các bác hưu trí dưới tán cây hoa giấy
        pOutlinedRect(c, 320, 840, 420, 180, "#c2b29b");
        pOutlinedRect(c, 390, 900, 70, 48, "#7f8c8d");
        pOutlinedRect(c, 580, 900, 70, 48, "#7f8c8d");
        drawShadeTree(c, 320, 860, 1.25, "#d81b60");
        drawShadeTree(c, 740, 860, 1.25, "#d81b60");
    }

    // 8. KHU ĐÓN GIÓ - ĐƯỜNG VEN BIỂN (BREEZE_AREA)
    {
        const zid = 'BREEZE_AREA';
        const c = zoneCanvases[zid].getContext('2d');
        drawOpenWorldBase(c, zid, "#7ab068", "#659c54", "#dce6e8", "#546269");

        // Khuôn viên bến xe, chừa đường lên Công Viên ở x=920..1080.
        pRect(c, 40, 30, 840, 460, '#b9ad94');
        pRect(c, 48, 38, 824, 444, '#c8bea7');
        for (let y = 55; y < 470; y += 40) {
            for (let x = 65; x < 860; x += 60) {
                pRect(c, x, y, 4, 2, '#b5aa92');
            }
        }
        // Hai lối nối từ mặt bằng ra đường chính, đủ rộng cho xe khách.
        pRect(c, 140, 482, 160, 34, '#c8bea7');
        pRect(c, 620, 482, 160, 34, '#c8bea7');
        pOutlinedRect(c, 85, 65, 720, 135, '#e1ceb0');
        pOutlinedRect(c, 75, 55, 740, 25, '#76554b');
        drawRentalStorefrontSign(c, 180, 83, 530,
            'BẾN XE LIÊN TỈNH 5AM', 'Đà Lạt · Miền Tây · Vũng Tàu', '#59685a', '#e4bd83');
        for (const x of [115, 240, 565, 690]) {
            pOutlinedRect(c, x, 151, 90, 32, '#678b8b');
        }
        pOutlinedRect(c, 390, 145, 105, 55, '#9f8061');
        addCollider(zid, 85, 65, 720, 135);
        c.fillStyle = PAL.OUTLINE;
        c.textAlign = 'center';
        c.font = "bold 12px 'Chakra Petch', sans-serif";
        for (const [index, bus] of terminalBuses.entries()) {
            pOutlinedRect(c, bus.x - 10, bus.y - 9, 180, 76, '#9a9486');
            pRect(c, bus.x - 6, bus.y - 5, 172, 68, '#c8bea7');
            c.fillText('Ô ' + (index + 1), bus.x + 77, bus.y + 85);
        }
        c.fillText('LỐI VÀO', 220, 476);
        c.fillText('LỐI RA', 700, 476);

        // Bờ kè đá & Biển xanh phía Nam (y = 820..1400)
        pOutlinedRect(c, 0, 800, WORLD_W, 26, "#95a5a6");
        pRect(c, 0, 826, WORLD_W, 574, "#1b7895");
        pRect(c, 0, 826, WORLD_W, 44, "#299ec2");
        pRect(c, 0, 826, WORLD_W, 10, "#d4f1f9");
        addCollider(zid, 0, 815, WORLD_W, 585);

        const r1 = GAME_CONFIG.RENTALS.BREEZE_AREA[0];
        drawFreestandingBuilding(c, zid, r1.x, r1.y, r1.w, r1.h, {
            wallCol: "#fff3d6", wallDark: "#e0cba0",
            title: "🌬️ KIOT CÀ PHÊ ĐÓN GIÓ", subTitle: "14.000.000đ / tháng",
            signBg: "#1f618d", signBorder: "#f1c40f"
        });

        pOutlinedRect(c, 0, 744, WORLD_W, 73, "#be9870");
        for (let x = 10; x < WORLD_W; x += 24) pRect(c, x, 748, 2, 64, "#a07d5f");
        pRect(c, 0, 802, WORLD_W, 4, "#765749");
        drawFreestandingBuilding(c, zid, 1360, 220, 240, 170, {
            wallCol: "#e8f4f8", wallDark: "#bed8e0",
            title: "THUÊ XE ĐẠP", subTitle: "20.000đ / lượt",
            signBg: "#117864", signBorder: "#f1c40f"
        });
        for (const x of [1325, 1365, 1580]) {
            drawBikeFrame(c, x, 408, "#b96553");
        }

        drawShadeTree(c, 1880, 140, 1.15);
        drawShadeTree(c, 1880, 370, 1.15);
        drawParkBench(c, 420, 760);
        drawParkBench(c, 1280, 760);
    }
}

function drawTower(c, zone, x, width, bottom, color) {
    pRect(c, x + 9, 10, width + 6, bottom + 2, "rgba(32, 37, 48, 0.28)");
    pOutlinedRect(c, x, -4, width, bottom + 4, '#344250');
    pRect(c, x + 3, 0, width - 6, bottom, color);
    pRect(c, x + 6, 0, 7, bottom - 4, 'rgba(235, 235, 220, 0.12)');
    pRect(c, x + width - 17, 0, 14, bottom, "#495764");
    pRect(c, x - 5, 8, width + 10, 8, '#cad2cc');
    pRect(c, x - 2, 16, width + 4, 3, '#4a5b69');
    for (let floor = 13; floor < bottom - 32; floor += 28) {
        pRect(c, x + 5, floor + 19, width - 10, 3, '#596673');
        for (let bay = 13; bay < width - 29; bay += 26) {
            const pattern = Math.abs((x + floor + bay) % 7);
            const lit = pattern < 3;
            pOutlinedRect(c, x + bay, floor, 17, 15, lit ? "#e7bc7b" : "#435662");
            pRect(c, x + bay + 2, floor + 2, 11, 2, lit ? '#fff0c8' : '#77939b');
            pRect(c, x + bay + 8, floor + 2, 1, 11, "#9db6b5");
            if ((bay + floor) % 3 === 0) pRect(c, x + bay - 2, floor + 16, 21, 2, '#b6c1b9');
        }
    }
    pRect(c, x + 18, bottom - 25, width - 36, 8, '#536471');
    pOutlinedRect(c, x + width / 2 - 25, bottom - 33, 50, 33, "#364655");
    pRect(c, x + width / 2 - 15, bottom - 24, 30, 19, "#88a3ad");
    pRect(c, x + width / 2 - 1, bottom - 24, 2, 19, '#d9e5d9');
    pRect(c, x + 18, 2, 2, 14, '#d7bd88');
    pRect(c, x + 16, 1, 6, 3, '#dfc57f');
    addCollider(zone, x, 0, width, bottom);
}

function drawVilla(c, x, y, width, name, color) {
    const height = 166;
    pOutlinedRect(c, x - 9, y + 17, width + 18, height + 21, "#91a06b");
    drawWeatheredWall(c, x, y, width, height, color, "#9e7c6c", "#f4dcbc");
    drawTiledRoof(c, x - 8, y - 17, width + 16, 35, "#a85b51", "#633e43");
    for (const offset of [27, width / 2 - 20, width - 67]) {
        drawShutteredWindow(c, x + offset, y + 29, 40, 43);
    }
    pOutlinedRect(c, x + 20, y + 72, width - 40, 12, "#705a54");
    for (let rail = x + 26; rail < x + width - 20; rail += 11) pRect(c, rail, y + 76, 2, 7, "#d3baa0");
    drawFoldingGate(c, x + width / 2 - 31, y + 124, 62, 42, "#52695e", "#333f37");
    drawTerracottaPlant(c, x + 23, y + 145, 1.45);
    drawTerracottaPlant(c, x + width - 42, y + 145, 1.45);
    drawRentalStorefrontSign(c, x + 15, y + 76, width - 30, name, "", "#634846", "#e4bd83");
    addCollider('VILLAS', x, y, width, height);
}

buildHomeBackground();
// Cảnh quan Đà Lạt: phố chợ dốc, thung lũng nhà kính và ga cổ giữa đồi thông.
for (const [zid, colors] of [
    ['DALAT_NIGHT', ['#5f7658', '#4b6148', '#cbbba5', '#62585b']],
    ['DALAT_GREENHOUSE', ['#75945e', '#5c7d4d', '#d8ccb3', '#665c55']],
    ['DALAT_PINE', ['#526e52', '#405c43', '#b6b5a2', '#555859']],
    ['MEKONG_QUAY', ['#6da486', '#578c70', '#c9c5ac', '#57686a']],
    ['MEKONG_FLOATING', ['#78a77e', '#5f9168', '#d0c6a6', '#52686a']],
    ['MEKONG_CRAFT', ['#72986e', '#5c805a', '#c9bea3', '#5b6260']],
    ['VUNGTAU_BAI_SAU', ['#7ba8a4', '#638f8b', '#d8c5a7', '#53686e']],
    ['VUNGTAU_FISHING', ['#6b9d9b', '#568583', '#d4c5a6', '#4a6268']],
    ['VUNGTAU_LIGHTHOUSE', ['#789f9e', '#5e8588', '#d6c5a7', '#52676e']]
]) {
    const c = zoneCanvases[zid].getContext('2d');
    drawOpenWorldBase(c, zid, ...colors);
}
function drawDalatMarketStall(c, x, y, awning, label) {
    pRect(c, x - 4, y + 64, 162, 10, 'rgba(48,42,36,0.24)');
    pOutlinedRect(c, x, y + 13, 7, 57, '#79583f');
    pOutlinedRect(c, x + 143, y + 13, 7, 57, '#79583f');
    pOutlinedRect(c, x - 8, y + 4, 166, 25, awning, '#554437');
    for (let i = 0; i < 8; i += 2) pRect(c, x + i * 9, y + 7, 9, 19, '#f7e8cf');
    pOutlinedRect(c, x, y + 43, 146, 25, '#9c704b');
    pOutlinedRect(c, x + 7, y + 35, 132, 18, '#e6d2b0');
    for (let i = 0; i < 5; i++) {
        const color = ['#cf6e73', '#e5b24f', '#7c9c76', '#b95d57', '#d99d79'][i];
        pOutlinedRect(c, x + 14 + i * 23, y + 38, 16, 11, color);
        pRect(c, x + 17 + i * 23, y + 40, 8, 2, '#fff0d4');
    }
    pOutlinedRect(c, x + 45, y - 19, 65, 21, '#f5e7c8');
    c.font = "bold 9px 'Chakra Petch', sans-serif"; c.fillStyle = '#584336'; c.textAlign = 'center';
    c.fillText(label, x + 77, y - 5, 60);
}

function drawDalatGreenhouse(c, x, y, width, height, tint, crop) {
    // Khung nhà kính có mái hai dốc, kính chia ô và các luống trồng nhìn xuyên qua.
    pRect(c, x - 12, y + height - 2, width + 25, 16, 'rgba(48,55,45,0.20)');
    pOutlinedRect(c, x, y + 20, width, height - 20, '#aec2ad', '#536657');
    c.fillStyle = tint;
    c.beginPath(); c.moveTo(x - 4, y + 24); c.lineTo(x + width / 2, y - 17); c.lineTo(x + width + 4, y + 24); c.closePath(); c.fill();
    c.strokeStyle = '#526757'; c.lineWidth = 5; c.stroke();
    pRect(c, x + 9, y + 25, width - 18, height - 12, 'rgba(184,220,202,0.58)');
    pRect(c, x + 12, y + 39, width - 24, 5, '#738e78');
    for (let row = 0; row < 3; row++) {
        const ry = y + 55 + row * 31;
        pRect(c, x + 22, ry, width - 44, 8, crop === 'flower' ? '#5a784d' : '#627b4e');
        for (let i = 0; i < Math.floor((width - 58) / 25); i++) {
            const px = x + 30 + i * 25;
            if (crop === 'strawberry') {
                pRect(c, px + 4, ry - 8, 10, 10, '#4d8a55');
                pRect(c, px + 7, ry - 3, 6, 7, i % 2 ? '#d54f58' : '#e4775d');
            } else if (crop === 'flower') {
                pRect(c, px + 6, ry - 9, 3, 10, '#47724b');
                pRect(c, px + 2, ry - 12, 10, 6, ['#d76f88', '#e8bd62', '#a779bd'][i % 3]);
            } else {
                pRect(c, px + 5, ry - 6, 8, 8, '#527743');
                pRect(c, px + 7, ry - 11, 5, 6, '#8e573e');
            }
        }
    }
    pRect(c, x + width / 2 - 2, y + 25, 4, height - 22, '#809686');
    for (let wx = x + 20; wx < x + width; wx += 38) pRect(c, wx, y + 30, 2, height - 30, 'rgba(76,102,83,0.65)');
    addCollider('DALAT_GREENHOUSE', x, y + 16, width, height - 13);
}

function drawDalatPineTree(c, x, y, scale = 1) {
    const sx = (n) => Math.round(n * scale);
    pRect(c, x - sx(28), y - sx(3), sx(72), sx(10), 'rgba(34,43,34,0.22)');
    pOutlinedRect(c, x + sx(13), y - sx(64), sx(13), sx(69), '#75553b');
    for (let level = 0; level < 5; level++) {
        const top = y - sx(164) + sx(level * 24);
        const half = sx(17 + level * 9);
        c.fillStyle = level % 2 ? '#315b46' : '#3b6b4e';
        c.strokeStyle = '#294b3b'; c.lineWidth = Math.max(2, sx(3));
        c.beginPath(); c.moveTo(x + sx(20), top); c.lineTo(x + sx(20) - half, top + sx(48));
        c.lineTo(x + sx(20) + half, top + sx(48)); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#73966a';
        c.beginPath(); c.moveTo(x + sx(17), top + sx(18));
        c.lineTo(x + sx(20) - half * 0.52, top + sx(42));
        c.lineTo(x + sx(20), top + sx(37)); c.closePath(); c.fill();
    }
}

function drawDalatStation(c, zone) {
    // Sân ga, đường ray và khối nhà Art Deco với ba đầu hồi gợi dáng núi Langbiang.
    pRect(c, 505, 862, 1015, 16, 'rgba(41,44,40,0.22)');
    pOutlinedRect(c, 478, 690, 1060, 175, '#897f70');
    pRect(c, 491, 701, 1034, 150, '#c8bca5');
    for (let x = 520; x < 1500; x += 34) pRect(c, x, 714, 20, 2, '#a79a82');
    // Lối tàu đôi và tà vẹt chạy ngang phía trước sân ga.
    pRect(c, 380, 904, 1240, 11, '#4d4944'); pRect(c, 380, 934, 1240, 11, '#4d4944');
    for (let x = 390; x < 1610; x += 42) pOutlinedRect(c, x, 898, 8, 43, '#775c47');
    // Tường ga màu vàng kem, dãy cửa vòm và mái ngói đỏ ba chóp.
    pOutlinedRect(c, 671, 597, 682, 159, '#e7d5b1', '#5b4838');
    pRect(c, 687, 614, 650, 12, '#f4e6ca');
    const gables = [
        [[680, 644], [796, 553], [912, 644]],
        [[850, 644], [1012, 538], [1174, 644]],
        [[1112, 644], [1228, 553], [1344, 644]]
    ];
    for (const points of gables) {
        c.fillStyle = '#a94e42'; c.strokeStyle = '#593c36'; c.lineWidth = 8;
        c.beginPath(); c.moveTo(...points[0]); c.lineTo(...points[1]); c.lineTo(...points[2]); c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = '#d18663'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(points[0][0] + 13, points[0][1] - 3); c.lineTo(points[1][0], points[1][1] + 14); c.lineTo(points[2][0] - 13, points[2][1] - 3); c.stroke();
    }
    // Relógio tròn, cửa vòm xanh sẫm, cột và bảng tên ga ở mặt tiền.
    c.fillStyle = '#f1e2bf'; c.strokeStyle = '#67483a'; c.lineWidth = 5;
    c.beginPath(); c.arc(1012, 611, 27, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#634a3a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(1012, 611); c.lineTo(1012, 592); c.moveTo(1012, 611); c.lineTo(1026, 618); c.stroke();
    for (const x of [716, 818, 914, 1096, 1192, 1286]) {
        pOutlinedRect(c, x, 638, 56, 85, '#658183', '#6d523d');
        pRect(c, x + 7, 646, 42, 68, '#99b9ad');
        pRect(c, x + 26, 647, 3, 66, '#e7d7b5');
    }
    pOutlinedRect(c, 909, 671, 206, 41, '#7c4439');
    pOutlinedRect(c, 917, 678, 190, 27, '#efd7a2');
    c.font = "bold 17px 'Chakra Petch', sans-serif"; c.fillStyle = '#754238'; c.textAlign = 'center';
    c.fillText('GA ĐÀ LẠT', 1012, 698);
    for (const x of [650, 1350]) {
        pRect(c, x, 735, 18, 66, '#7e5540');
        pRect(c, x - 5, 730, 28, 8, '#d0a468');
    }
    addCollider(zone, 671, 596, 682, 151);
    // Đầu máy hơi nước đỏ và toa gỗ, đặt riêng trên đường ray phía trước ga.
    pRect(c, 652, 826, 753, 11, 'rgba(45,40,36,0.24)');
    pOutlinedRect(c, 708, 790, 246, 83, '#b74e3c', '#4f4137');
    pRect(c, 729, 799, 122, 24, '#d77a50');
    pOutlinedRect(c, 858, 782, 72, 72, '#37393a', '#4f4137');
    pRect(c, 874, 794, 40, 30, '#d6e2d4');
    pOutlinedRect(c, 670, 812, 37, 41, '#463c36');
    pRect(c, 668, 850, 296, 7, '#393735');
    for (const x of [724, 913]) {
        c.fillStyle = '#373534'; c.beginPath(); c.arc(x, 873, 18, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#b88a58'; c.beginPath(); c.arc(x, 873, 8, 0, Math.PI * 2); c.fill();
    }
    pRect(c, 833, 761, 12, 25, '#53463d'); pRect(c, 835, 749, 8, 14, '#a84d3e');
    for (const [x, color] of [[980, '#718b78'], [1160, '#c28b58']]) {
        pOutlinedRect(c, x, 803, 169, 56, color, '#51453c');
        pRect(c, x + 13, 812, 142, 30, '#9eb5a4');
        for (const wx of [x + 24, x + 68, x + 112]) pOutlinedRect(c, wx, 816, 28, 24, '#d9e2d1');
        for (const wx of [x + 31, x + 118]) {
            c.fillStyle = '#393735'; c.beginPath(); c.arc(wx, 870, 13, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#b88a58'; c.beginPath(); c.arc(wx, 870, 6, 0, Math.PI * 2); c.fill();
        }
    }
    addCollider(zone, 700, 790, 680, 83);
    // Bụi hoa ở sân ga và bảng chỉ đường gỗ.
    for (const x of [545, 1480]) {
        pOutlinedRect(c, x, 820, 96, 31, '#627f60');
        for (let i = 0; i < 6; i++) pRect(c, x + 9 + i * 13, 811 + (i % 2) * 4, 8, 10, i % 3 ? '#d47a8b' : '#efc767');
    }
}

{
    const zone = 'DALAT_NIGHT';
    const c = zoneCanvases[zone].getContext('2d');
    // Con dốc lát đá và bậc tam cấp bẻ nhẹ qua quảng trường chợ.
    pOutlinedRect(c, 0, 445, WORLD_W, 298, '#c8b9a3');
    pRect(c, 0, 461, WORLD_W, 265, '#b9ad9a');
    for (let row = 0; row < 9; row++) {
        const y = 480 + row * 28;
        pRect(c, 0, y, WORLD_W, 3, row % 2 ? '#d2c3aa' : '#a79a88');
        for (let x = (row % 2) * 24; x < WORLD_W; x += 48) pRect(c, x, y + 4, 2, 22, '#a99b88');
    }
    // Khối chợ mái ngói, bảng neon và cửa sạp sáng đèn.
    pOutlinedRect(c, 700, 239, 595, 197, '#d1b38a', '#514137');
    drawTiledRoof(c, 687, 220, 621, 54, '#a94f43', '#533c35');
    for (const x of [730, 852, 974, 1096, 1218]) {
        pOutlinedRect(c, x, 292, 83, 108, '#6d5949');
        pRect(c, x + 8, 301, 67, 48, '#b9c3ae');
        pRect(c, x + 14, 307, 55, 36, '#dfb76e');
        pRect(c, x + 8, 354, 67, 38, '#805e47');
    }
    pOutlinedRect(c, 838, 404, 319, 48, '#754238');
    pOutlinedRect(c, 846, 411, 303, 34, '#f0d395');
    c.font = "bold 19px 'Chakra Petch', sans-serif"; c.fillStyle = '#703c32'; c.textAlign = 'center';
    c.fillText('CHỢ ĐÊM ĐÀ LẠT', 997, 434);
    addCollider(zone, 700, 239, 595, 197);
    // Mặt tiền quán nhỏ và cầu thang dốc đặt gần phố đi bộ để hiện rõ khi vừa tới.
    for (const [x, wall, roof] of [[265, '#e8d1ad', '#9b5547'], [1455, '#d9c9ad', '#745649']]) {
        drawWeatheredWall(c, x, 565, 230, 132, wall, roof, '#f3e3c5');
        drawTiledRoof(c, x - 12, 543, 254, 38, roof, '#514039');
        drawShutteredWindow(c, x + 24, 602, 39, 43);
        drawShutteredWindow(c, x + 166, 602, 39, 43);
        pOutlinedRect(c, x + 92, 646, 45, 51, '#70503d');
        pOutlinedRect(c, x + 42, 615, 146, 24, '#f0d89f');
        c.font = "bold 10px 'Chakra Petch', sans-serif"; c.fillStyle = '#714137'; c.textAlign = 'center';
        c.fillText(x < 500 ? 'TIỆM LEN' : 'QUÁN SỮA', x + 115, 632);
        addCollider(zone, x, 565, 230, 132);
    }
    for (let i = 0; i < 11; i++) {
        const sx = 390 + i * 21, sy = 632 + i * 15;
        pOutlinedRect(c, sx, sy, 176, 19, i % 2 ? '#c8b99f' : '#dfd0b5');
        pRect(c, sx + 7, sy + 13, 162, 3, '#8d7e6b');
    }
    // Cổng chợ treo đèn lồng, đặt ngay trên dãy sạp thay vì khuất ở đầu bản đồ.
    pRect(c, 790, 760, 9, 116, '#714b39'); pRect(c, 1196, 760, 9, 116, '#714b39');
    pOutlinedRect(c, 776, 745, 443, 45, '#78483b');
    pOutlinedRect(c, 784, 753, 427, 29, '#f0d59c');
    c.font = "bold 18px 'Chakra Petch', sans-serif"; c.fillStyle = '#743d34'; c.textAlign = 'center';
    c.fillText('CHỢ ĐÊM ĐÀ LẠT', 997, 774);
    // Dãy sạp mái bạt dọc lối dốc, đèn lồng và dây cờ ấm màu.
    drawDalatMarketStall(c, 225, 826, '#ad5148', 'ĐỒ LEN');
    drawDalatMarketStall(c, 495, 922, '#637b75', 'DÂU TÂY');
    drawDalatMarketStall(c, 795, 826, '#cf8e48', 'BÁNH NÓNG');
    drawDalatMarketStall(c, 1095, 922, '#a95349', 'HOA TƯƠI');
    drawDalatMarketStall(c, 1400, 826, '#587f83', 'ĐẶC SẢN');
    drawDalatMarketStall(c, 1660, 922, '#b86350', 'TRÀ & MỨT');
    for (let i = 0; i < 8; i++) {
        const x = 185 + i * 225;
        pRect(c, x, 756, 3, 67, '#59483b');
        pRect(c, x + 2, 758, 88, 3, '#685144');
        pRect(c, x + 16, 761, 14, 20, i % 2 ? '#d97561' : '#e4b34e');
        pRect(c, x + 54, 761, 14, 20, i % 2 ? '#e4b34e' : '#d97561');
    }
    for (const x of [385, 1360]) drawParkBench(c, x, 700);
    pOutlinedRect(c, 837, 468, 320, 37, '#735843');
    pRect(c, 846, 477, 302, 19, '#ead8b8');
    c.font = "bold 12px 'Chakra Petch', sans-serif"; c.fillStyle = '#59463a';
    c.fillText('PHỐ DỐC · CHỢ ĐÊM · ĐÀ LẠT', 997, 492);
}
{
    const zone = 'DALAT_GREENHOUSE';
    const c = zoneCanvases[zone].getContext('2d');
    // Thung lũng mở với ruộng bậc thấp, rãnh tưới và nhà kính nhiều nhịp mái.
    pRect(c, 0, 755, WORLD_W, 310, '#8ba36d');
    for (let y = 774; y < 1050; y += 36) {
        pRect(c, 0, y, WORLD_W, 4, '#6f8b5b');
        pRect(c, 0, y + 5, WORLD_W, 7, '#a4b97d');
    }
    drawDalatGreenhouse(c, 122, 710, 340, 208, 'rgba(190,226,215,0.78)', 'strawberry');
    drawDalatGreenhouse(c, 558, 690, 340, 208, 'rgba(180,216,214,0.76)', 'flower');
    drawDalatGreenhouse(c, 1002, 710, 340, 208, 'rgba(203,225,205,0.76)', 'coffee');
    drawDalatGreenhouse(c, 1450, 690, 340, 208, 'rgba(183,215,204,0.76)', 'strawberry');
    // Luống hoa ngoài trời và vườn dâu thấp, xen lối đất để người chơi đi lại.
    for (let row = 0; row < 4; row++) {
        const y = 936 + row * 40;
        pRect(c, 190, y, 520, 13, '#5c784c'); pRect(c, 1292, y, 500, 13, '#5c784c');
        for (let i = 0; i < 20; i++) {
            const x1 = 202 + i * 24, x2 = 1302 + i * 23;
            pRect(c, x1 + 5, y - 12, 4, 13, '#467549'); pRect(c, x1, y - 16, 11, 6, i % 3 ? '#d96786' : '#edc467');
            pRect(c, x2 + 5, y - 8, 7, 8, '#4b824e'); pRect(c, x2 + 5, y - 4, 5, 7, '#d85156');
        }
    }
    // Chòi nông cụ, bồn nước và các thùng hái dâu đặt cạnh lối đi.
    pOutlinedRect(c, 900, 925, 146, 48, '#8b744e');
    pRect(c, 910, 932, 126, 32, '#7fa9a5');
    pRect(c, 920, 939, 106, 4, '#b4d3c1');
    for (const [x, y] of [[720, 790], [1280, 790]]) {
        pOutlinedRect(c, x, y, 46, 40, '#8e6746');
        pRect(c, x + 6, y + 7, 34, 26, '#cc6258');
        for (let i = 0; i < 4; i++) pRect(c, x + 10 + i * 7, y + 13, 4, 4, '#f0d48e');
    }
    pOutlinedRect(c, 1078, 1080, 58, 42, '#87613f');
    pRect(c, 1085, 1088, 44, 25, '#c2d7bb');
    for (let i = 0; i < 4; i++) {
        pRect(c, 1091 + i * 9, 1084, 3, 11, '#48754c');
        pRect(c, 1087 + i * 9, 1080, 10, 6, ['#d9788f', '#ecc66b', '#a983bd', '#db7380'][i]);
    }
    pOutlinedRect(c, 724, 978, 78, 39, '#8b6545');
    pRect(c, 731, 984, 64, 26, '#cf6759');
    for (let i = 0; i < 5; i++) pRect(c, 737 + i * 11, 988 + (i % 2) * 7, 6, 6, '#f1d58d');
    pOutlinedRect(c, 1215, 978, 92, 43, '#77563f');
    pRect(c, 1222, 985, 78, 28, '#c5a374');
    for (let i = 0; i < 3; i++) pRect(c, 1228 + i * 23, 990, 14, 19, '#704d38');
    pOutlinedRect(c, 855, 835, 300, 44, '#718a74');
    pOutlinedRect(c, 864, 843, 282, 28, '#e5ebd8');
    c.font = "bold 15px 'Chakra Petch', sans-serif"; c.fillStyle = '#526a51'; c.textAlign = 'center';
    c.fillText('THUNG LŨNG NHÀ KÍNH', 1005, 863);
}
{
    const zone = 'DALAT_PINE';
    const c = zoneCanvases[zone].getContext('2d');
    // Đồi thông ôm quanh sân ga, dải đồi xanh và biệt thự Pháp giữa vườn cẩm tú cầu.
    pRect(c, 0, 0, WORLD_W, 745, '#78916c');
    for (let x = -20; x < WORLD_W; x += 176) {
        const crest = 175 + (Math.floor(x / 176) % 4) * 35;
        pRect(c, x, crest, 112, 7, '#617b5e');
        pRect(c, x + 18, crest - 11, 69, 12, '#8da079');
    }
    for (const [x, y, scale] of [[28, 735, 1.35], [190, 730, 1.15], [385, 744, 1.3], [1510, 744, 1.25], [1705, 730, 1.42], [1905, 743, 1.2]]) {
        drawDalatPineTree(c, x, y, scale);
    }
    // Mái biệt thự ngói đỏ phía trên vườn, không dùng lại mẫu storefront của Sài Gòn.
    drawWeatheredWall(c, 180, 300, 288, 163, '#e5d4b5', '#885f4c', '#f4e5ca');
    drawTiledRoof(c, 163, 276, 322, 48, '#a45246', '#563d37');
    for (const x of [208, 326, 405]) drawShutteredWindow(c, x, 347, 42, 49);
    pOutlinedRect(c, 292, 410, 64, 53, '#58726d'); pRect(c, 303, 421, 42, 42, '#283b3b');
    addCollider(zone, 180, 301, 288, 163);
    drawWeatheredWall(c, 1465, 275, 300, 177, '#d8d0b7', '#6f7164', '#eee3cc');
    drawTiledRoof(c, 1446, 251, 338, 50, '#79584a', '#493d37');
    for (const x of [1503, 1610, 1708]) drawShutteredWindow(c, x, 329, 43, 50);
    pOutlinedRect(c, 1580, 398, 66, 54, '#506d65'); pRect(c, 1591, 410, 44, 42, '#263b3a');
    addCollider(zone, 1465, 276, 300, 176);
    // Thảm hoa dọc lối ga, sân chờ lát đá và mái che đỏ kem.
    for (const x of [510, 1410]) {
        pOutlinedRect(c, x, 690, 104, 52, '#66815d');
        for (let i = 0; i < 8; i++) pRect(c, x + 9 + i * 11, 680 + (i % 2) * 5, 7, 12, ['#d36f8b', '#bd8ac1', '#efc469'][i % 3]);
    }
    drawDalatStation(c, zone);
    // Cột đèn ga kiểu cổ và ghế chờ ở sân lát đá.
    for (const x of [603, 1535]) {
        pRect(c, x, 748, 5, 96, '#584b41');
        pOutlinedRect(c, x - 10, 741, 25, 18, '#f0c36d');
        pRect(c, x - 5, 746, 15, 8, '#fff0c2');
    }
    for (const x of [560, 1450]) {
        pOutlinedRect(c, x, 956, 112, 12, '#725b48');
        pRect(c, x + 8, 968, 8, 23, '#59483b'); pRect(c, x + 96, 968, 8, 23, '#59483b');
    }
}
function drawMekongRiver(c, startY, shallow = '#5ea6a0') {
    pRect(c, 0, startY - 54, WORLD_W, 54, '#c4b18b');
    for (let x = 0; x < WORLD_W; x += 42) pRect(c, x, startY - 48, 3, 45, '#9e8f73');
    pRect(c, 0, startY, WORLD_W, WORLD_H - startY, '#397f85');
    pRect(c, 0, startY, WORLD_W, 75, shallow);
    pRect(c, 0, startY + 75, WORLD_W, 120, '#4a9795');
    for (let y = startY + 25; y < WORLD_H; y += 72) {
        for (let x = 20; x < WORLD_W; x += 118) {
            pRect(c, x + (y % 17), y, 54, 3, 'rgba(210,238,213,0.60)');
            pRect(c, x + 46, y + 24, 29, 2, 'rgba(181,222,205,0.45)');
        }
    }
}

function drawMekongCargoBoat(c, x, y, body, canopy, poleItem) {
    // Ghe ba lá dài, mui che màu và cây bẹo treo món hàng phía mũi.
    pRect(c, x + 12, y + 48, 190, 10, 'rgba(27,45,43,0.24)');
    c.fillStyle = '#493b2e'; c.beginPath();
    c.moveTo(x, y + 19); c.lineTo(x + 18, y + 9); c.lineTo(x + 178, y + 9);
    c.lineTo(x + 205, y + 22); c.lineTo(x + 184, y + 42); c.lineTo(x + 23, y + 42); c.closePath(); c.fill();
    pRect(c, x + 18, y + 17, 166, 22, body);
    pRect(c, x + 48, y + 12, 94, 27, canopy);
    for (let i = 0; i < 5; i++) pRect(c, x + 53 + i * 17, y + 14, 8, 23, i % 2 ? '#f1d5a0' : canopy);
    pRect(c, x + 15, y + 8, 3, 30, '#694e36');
    pRect(c, x + 5, y - 5, 26, 15, '#d6bd84');
    c.font = "bold 9px 'Chakra Petch', sans-serif"; c.fillStyle = '#5f4833'; c.textAlign = 'center';
    c.fillText(poleItem, x + 18, y + 5, 36);
    pRect(c, x + 84, y + 39, 4, 14, '#78583d');
}

{
    const zone = 'MEKONG_QUAY';
    const c = zoneCanvases[zone].getContext('2d');
    // Bến Ninh Kiều: phố đèn phía trong, quảng trường lát đá và cầu tàu rộng.
    pRect(c, 0, 0, WORLD_W, 752, '#78a17a');
    for (const [x, w, wall, sign] of [[90, 270, '#e8d3ae', 'NHÀ HÀNG SÔNG HẬU'], [430, 245, '#d8dfc7', 'CÀ PHÊ BẾN SÔNG'], [1320, 275, '#dfc4a0', 'PHỐ NINH KIỀU'], [1660, 240, '#d1ddc7', 'BẾN DU THUYỀN']]) {
        drawWeatheredWall(c, x, 340, w, 190, wall, '#725541', '#f1dfbf');
        drawTiledRoof(c, x - 12, 316, w + 24, 43, '#93604a', '#504038');
        for (const wx of [x + 24, x + w - 68]) drawShutteredWindow(c, wx, 394, 42, 51);
        pOutlinedRect(c, x + w / 2 - 57, 474, 114, 34, '#74503b');
        c.font = "bold 9px 'Chakra Petch', sans-serif"; c.fillStyle = '#fff0d1'; c.textAlign = 'center';
        c.fillText(sign, x + w / 2, 495, w - 30);
        addCollider(zone, x, 340, w, 190);
    }
    pOutlinedRect(c, 585, 617, 830, 113, '#8e806d');
    pRect(c, 598, 630, 804, 85, '#d5c4a4');
    for (let x = 610; x < 1400; x += 56) pRect(c, x, 632, 2, 80, '#b5a789');
    pOutlinedRect(c, 782, 540, 436, 54, '#75463a');
    pOutlinedRect(c, 791, 548, 418, 38, '#f0d599');
    c.font = "bold 19px 'Chakra Petch', sans-serif"; c.fillStyle = '#704238'; c.textAlign = 'center';
    c.fillText('BẾN NINH KIỀU', 1000, 574);
    // Cầu đi bộ cong cách điệu, lan can vàng và dải đèn trên sông.
    c.strokeStyle = '#e6c37b'; c.lineWidth = 14; c.beginPath();
    c.moveTo(90, 806); c.quadraticCurveTo(480, 736, 850, 806); c.quadraticCurveTo(1240, 877, 1910, 798); c.stroke();
    c.strokeStyle = '#795d45'; c.lineWidth = 4; c.beginPath();
    c.moveTo(90, 797); c.quadraticCurveTo(480, 727, 850, 797); c.quadraticCurveTo(1240, 868, 1910, 789); c.stroke();
    for (let x = 130; x < 1900; x += 120) {
        pRect(c, x, 780 + Math.round(Math.sin(x * .008) * 24), 5, 33, '#72543d');
        pRect(c, x - 7, 772 + Math.round(Math.sin(x * .008) * 24), 18, 9, '#f0c46c');
    }
    drawMekongRiver(c, 1010, '#6eb0a4');
    addCollider(zone, 0, 1010, WORLD_W, WORLD_H - 1010);
    // Cầu tàu và ghe chở khách neo ngay trước bến.
    pOutlinedRect(c, 875, 936, 254, 28, '#755942'); pRect(c, 886, 943, 232, 14, '#bd9864');
    for (let x = 900; x < 1110; x += 44) pRect(c, x, 960, 5, 54, '#76583e');
    drawMekongCargoBoat(c, 1140, 957, '#a95142', '#e2b567', 'KHÁCH');
}
{
    const zone = 'MEKONG_FLOATING';
    const c = zoneCanvases[zone].getContext('2d');
    // Chợ nổi là mặt sông rộng với bến gỗ hai bờ và ghe hàng quay mũi vào lối chợ.
    pRect(c, 0, 0, WORLD_W, WORLD_H, '#74a27a');
    pRect(c, 0, 752, WORLD_W, 49, '#a9926b');
    pRect(c, 0, 801, WORLD_W, 309, '#478e91');
    pRect(c, 0, 801, WORLD_W, 47, '#78b7a7');
    for (let x = 0; x < WORLD_W; x += 70) {
        pRect(c, x, 786, 4, 26, '#755a40');
        pRect(c, x + 15, 868 + (x % 3) * 19, 47, 3, 'rgba(210,238,213,0.62)');
    }
    // Mấy căn chòi miệt vườn và bến nhỏ ven rạch.
    for (const [x, wall, roof] of [[180, '#e3c99e', '#986044'], [1460, '#d3dfbf', '#815845']]) {
        drawWeatheredWall(c, x, 484, 255, 170, wall, roof, '#f0dfbd');
        drawTiledRoof(c, x - 15, 460, 285, 42, roof, '#4c4035');
        drawShutteredWindow(c, x + 30, 542, 42, 49); drawShutteredWindow(c, x + 168, 542, 42, 49);
        addCollider(zone, x, 484, 255, 170);
    }
    // Ghe hàng nhiều màu, mỗi ghe có cây bẹo treo đúng món đang bán.
    drawMekongCargoBoat(c, 145, 857, '#a95142', '#e3b96a', 'DỪA');
    drawMekongCargoBoat(c, 430, 978, '#567d69', '#cf9c55', 'XOÀI');
    drawMekongCargoBoat(c, 725, 857, '#567f8a', '#dcaa5e', 'CÁ');
    drawMekongCargoBoat(c, 1020, 978, '#ad6845', '#dfbd79', 'KHÓM');
    drawMekongCargoBoat(c, 1315, 857, '#7b6653', '#d4a453', 'CHUỐI');
    drawMekongCargoBoat(c, 1605, 978, '#9d4e45', '#d7b165', 'BÁN GÌ?');
    // Sàn chợ nổi giữa sông và các thùng nông sản, làm điểm đứng gom hàng.
    pOutlinedRect(c, 850, 736, 300, 41, '#775a40'); pRect(c, 860, 744, 280, 24, '#d1b17a');
    pOutlinedRect(c, 884, 923, 64, 35, '#8b6545'); pRect(c, 891, 929, 50, 21, '#9e573f');
    for (let i = 0; i < 4; i++) pRect(c, 896 + i * 10, 933, 6, 7, '#e1c269');
    pOutlinedRect(c, 1220, 925, 64, 35, '#8b6545'); pRect(c, 1227, 931, 50, 21, '#d8b577');
    pOutlinedRect(c, 870, 475, 260, 42, '#e8d6b1');
    c.font = "bold 15px 'Chakra Petch', sans-serif"; c.fillStyle = '#624936'; c.textAlign = 'center';
    c.fillText('CHỢ NỔI MIỆT VƯỜN', 1000, 502);
}
{
    const zone = 'MEKONG_CRAFT';
    const c = zoneCanvases[zone].getContext('2d');
    // Xóm ven rạch, nhà gỗ sàn cao, hàng dừa nước và cầu ván nối các sân nghề.
    pRect(c, 0, 0, WORLD_W, WORLD_H, '#71956e');
    for (let x = 0; x < WORLD_W; x += 220) {
        pRect(c, x, 280 + (x % 3) * 50, 98, 16, '#39775f');
        pRect(c, x + 14, 266 + (x % 3) * 50, 73, 19, '#598f6c');
    }
    pRect(c, 0, 1010, WORLD_W, 390, '#43868a');
    addCollider(zone, 0, 1010, WORLD_W, 390);
    for (let x = 40; x < WORLD_W; x += 145) {
        pOutlinedRect(c, x, 961, 118, 22, '#73583f');
        pRect(c, x + 8, 968, 102, 8, '#bd9a65');
    }
    for (const [x, wall, roof] of [[175, '#e1c59a', '#80543c'], [620, '#d6d9b8', '#9a6648'], [1285, '#e5cda4', '#755744'], [1650, '#d7dfc2', '#976449']]) {
        pRect(c, x + 6, 625, 250, 25, 'rgba(36,44,38,0.22)');
        drawWeatheredWall(c, x, 470, 238, 160, wall, roof, '#f0dfbf');
        drawTiledRoof(c, x - 14, 446, 266, 43, roof, '#4c3e34');
        pRect(c, x - 10, 615, 258, 15, '#76563d');
        for (const wx of [x + 25, x + 165]) drawShutteredWindow(c, wx, 525, 42, 49);
        addCollider(zone, x, 470, 238, 160);
    }
    // Khung dệt, sợi tơ màu, khung phơi lụa và sạp kẹo dừa.
    for (const [x, y, cloth] of [[350, 755, '#bf6477'], [715, 757, '#d6ad54'], [1080, 755, '#6c91a0'], [1445, 757, '#7f9a72']]) {
        pOutlinedRect(c, x, y, 236, 142, '#75533c');
        pRect(c, x + 10, y + 10, 216, 122, '#e0c99e');
        pRect(c, x + 24, y + 22, 187, 93, cloth);
        for (let i = 0; i < 8; i++) pRect(c, x + 29 + i * 24, y + 24, 6, 89, i % 2 ? '#f0dcae' : '#563f39');
        pRect(c, x + 4, y + 3, 228, 6, '#443b32');
    }
    // Cầu khỉ nhỏ qua rạch và bảng làng nghề ở lối vào.
    pOutlinedRect(c, 838, 677, 326, 50, '#6d513d'); pRect(c, 848, 685, 306, 34, '#e5d2aa');
    c.font = "bold 16px 'Chakra Petch', sans-serif"; c.fillStyle = '#694637'; c.textAlign = 'center';
    c.fillText('LÀNG NGHỀ VEN RẠCH', 1000, 708);
    for (let i = 0; i < 12; i++) pRect(c, 810 + i * 32, 944 + (i % 2) * 4, 26, 5, '#dbc18e');
}
// Ba khu Vũng Tàu nằm ngang. Dải biển chạy xuyên suốt phía nam để khu nào
// người chơi ghé cũng đọc được ngay đây là một thành phố biển.
function drawVungTauCoast(c, zone, terrain = 'sand') {
    pRect(c, 0, 744, WORLD_W, 66, terrain === 'cliff' ? '#a99e87' : '#d9c9a8');
    for (let x = 0; x < WORLD_W; x += 48) {
        pRect(c, x, 746, 3, 62, '#b9aa91');
        pRect(c, x + 2, 776, 46, 2, '#c4b59c');
    }
    pRect(c, 0, 810, WORLD_W, 310, terrain === 'cliff' ? '#b9ad96' : '#efd49b');
    for (let y = 824; y < 1100; y += 31) {
        for (let x = 16; x < WORLD_W; x += 61) {
            const offset = (x * 3 + y * 7) % 23;
            pRect(c, x + offset, y, 5, 2, terrain === 'cliff' ? '#938c7b' : '#d1b77f');
            pRect(c, x + 21, y + 13, 3, 2, '#fae6bd');
        }
    }
    pRect(c, 0, 1087, WORLD_W, 33, terrain === 'cliff' ? '#8b8b7c' : '#d5bf90');
    pRect(c, 0, 1120, WORLD_W, 280, '#247c96');
    pRect(c, 0, 1120, WORLD_W, 54, '#69c2bd');
    pRect(c, 0, 1174, WORLD_W, 91, '#3aa8b3');
    pRect(c, 0, 1265, WORLD_W, 135, '#24718e');
    for (let x = 0; x < WORLD_W; x += 76) {
        pRect(c, x, 1115 + (Math.floor(x / 76) % 3) * 3, 72, 7, '#f1f2da');
        pRect(c, x + 15, 1202, 34, 3, '#91d8ce');
        pRect(c, x + 30, 1327, 32, 3, '#65b5c3');
    }
    addCollider(zone, 0, 1120, WORLD_W, 280);
    if (terrain === 'sand') {
        for (const x of [110, 1880]) drawBeachPalm(c, x, 858);
    } else {
        // Đá ven bờ thấp, thưa và có lối đi xuyên qua, không chặn tuyến ngang.
        for (const [x, y, w] of [[80, 1060, 102], [310, 1080, 82], [1690, 1058, 112]]) {
            pOutlinedRect(c, x, y, w, 29, '#737970');
            pRect(c, x + 10, y - 5, w - 25, 12, '#a49f8e');
        }
    }
}

function drawBeachPalm(c, x, y) {
    pRect(c, x + 2, y + 3, 78, 10, 'rgba(65,65,42,0.20)');
    pOutlinedRect(c, x + 31, y - 103, 16, 108, '#896744');
    for (let dy = -94; dy < -8; dy += 17) pRect(c, x + 34, y + dy, 10, 3, '#bb975f');
    for (const [dx, dy, w] of [[-63, -119, 73], [43, -119, 74], [-51, -139, 66], [37, -139, 65], [-9, -153, 65]]) {
        pRect(c, x + dx, y + dy, w, 13, '#37694d');
        pRect(c, x + dx + 6, y + dy - 5, w - 14, 8, '#619a63');
    }
    pRect(c, x + 32, y - 163, 14, 53, '#54865b');
}

function drawVungTauHotel(c, x, y, w, h, wall, sign) {
    pRect(c, x - 8, y + h - 10, w + 16, 20, 'rgba(41,48,45,0.24)');
    pOutlinedRect(c, x, y, w, h, wall, '#55453a');
    pRect(c, x + 8, y + 9, w - 16, 7, '#f2dfbd');
    pRect(c, x + 10, y + 22, w - 20, 4, '#9b5d4c');
    for (let row = 0; row < Math.floor((h - 56) / 31); row++) {
        pRect(c, x + 9, y + 53 + row * 31, w - 18, 3, '#aa8a6c');
        for (let wx = x + 15; wx < x + w - 22; wx += 33) {
            pOutlinedRect(c, wx, y + 31 + row * 31, 23, 18, '#7da5a2', '#624b42');
            pRect(c, wx + 10, y + 33 + row * 31, 2, 14, '#e8d7b6');
        }
    }
    pOutlinedRect(c, x + 12, y + h - 40, w - 24, 27, '#456b72');
    c.font = "bold 12px 'Chakra Petch', sans-serif";
    c.fillStyle = '#fff2d6'; c.textAlign = 'center';
    c.fillText(sign, x + w / 2, y + h - 21, w - 34);
    addCollider('VUNGTAU_BAI_SAU', x, y, w, h - 8);
}

function drawBeachUmbrella(c, x, y, color) {
    pRect(c, x + 24, y + 36, 5, 37, '#8b7057');
    pRect(c, x - 2, y + 69, 58, 5, 'rgba(65,65,42,0.18)');
    pOutlinedRect(c, x - 15, y, 83, 26, color, '#4e5148');
    pRect(c, x - 4, y + 5, 60, 5, '#f3e6c9');
    pRect(c, x + 24, y + 2, 5, 23, '#f0d394');
    for (let i = 0; i < 2; i++) {
        const sx = x - 8 + i * 45;
        pOutlinedRect(c, sx, y + 78, 25, 53, '#d9bd8d');
        pRect(c, sx + 4, y + 83, 17, 37, '#f3e9ce');
    }
}

function drawFishingMarketStall(c, x, y, awning, label) {
    // Mái bạt sọc, cọc gỗ, mặt quầy và khay đá tạo nhịp riêng cho từng sạp.
    pRect(c, x - 8, y + 67, 180, 9, 'rgba(46,47,39,0.24)');
    for (const px of [x + 3, x + 157]) pOutlinedRect(c, px, y + 13, 8, 67, '#775638');
    pOutlinedRect(c, x - 9, y + 4, 180, 25, awning, '#54463a');
    for (let i = 0; i < 8; i += 2) pRect(c, x + i * 10, y + 6, 10, 21, '#f3e5c3');
    pOutlinedRect(c, x, y + 43, 164, 28, '#9c704b');
    pOutlinedRect(c, x + 9, y + 35, 145, 21, '#c4d9d2');
    for (let i = 0; i < 5; i++) {
        const bx = x + 15 + i * 26;
        pOutlinedRect(c, bx, y + 38 + (i % 2) * 3, 20, 12, i % 2 ? '#7ba6a4' : '#d8a06a');
        pRect(c, bx + 5, y + 42 + (i % 2) * 3, 9, 2, '#f4e2b1');
    }
    pOutlinedRect(c, x + 58, y - 21, 75, 22, '#fff0c8');
    c.font = "bold 9px 'Chakra Petch', sans-serif";
    c.fillStyle = '#573e2e'; c.textAlign = 'center';
    c.fillText(label, x + 95, y - 6, 69);
}

function drawRoundLighthouse(c, x, y) {
    // Tháp thuôn tròn, có ban công vòng, hai dải đỏ và chụp đèn kính.
    pRect(c, x - 67, y + 251, 230, 19, 'rgba(38,45,41,0.24)');
    pOutlinedRect(c, x - 32, y + 214, 161, 36, '#877c6b');
    pRect(c, x - 22, y + 194, 141, 28, '#d7d0be');
    c.fillStyle = '#50473f';
    c.beginPath(); c.moveTo(x - 7, y + 206); c.lineTo(x + 17, y + 30); c.lineTo(x + 88, y + 30); c.lineTo(x + 111, y + 206); c.closePath(); c.fill();
    c.fillStyle = '#f1e9d7';
    c.beginPath(); c.moveTo(x + 1, y + 198); c.lineTo(x + 22, y + 39); c.lineTo(x + 82, y + 39); c.lineTo(x + 103, y + 198); c.closePath(); c.fill();
    pRect(c, x + 4, y + 152, 96, 16, '#b64f43');
    pRect(c, x + 9, y + 155, 86, 7, '#d86a53');
    pRect(c, x + 12, y + 76, 81, 15, '#b64f43');
    pRect(c, x + 16, y + 79, 73, 7, '#d86a53');
    for (const wx of [x + 27, x + 70]) {
        pOutlinedRect(c, wx, y + 109, 13, 28, '#52757a', '#695d50');
        pRect(c, wx + 5, y + 112, 3, 21, '#b9d5cb');
    }
    pOutlinedRect(c, x + 2, y + 24, 102, 15, '#55463d');
    pRect(c, x + 8, y + 27, 90, 8, '#f5eee0');
    for (let i = 0; i < 15; i++) pRect(c, x + 7 + i * 6, y + 10, 2, 15, '#695a4a');
    pOutlinedRect(c, x + 15, y - 20, 77, 34, '#4e514b');
    pRect(c, x + 22, y - 14, 63, 21, '#eedb98');
    pRect(c, x + 29, y - 12, 7, 17, '#f9f4d8');
    pRect(c, x + 40, y - 12, 7, 17, '#f9f4d8');
    pRect(c, x + 51, y - 12, 7, 17, '#f9f4d8');
    pOutlinedRect(c, x + 8, y - 30, 91, 10, '#a64c40');
    pOutlinedRect(c, x + 39, y - 43, 30, 13, '#615144');
    pRect(c, x + 45, y - 51, 18, 8, '#615144');
    pRect(c, x + 53, y - 66, 3, 15, '#615144');
    // Cửa vòm chân tháp.
    pOutlinedRect(c, x + 38, y + 166, 30, 40, '#705748');
    pRect(c, x + 43, y + 172, 20, 34, '#31434a');
    pRect(c, x + 51, y + 181, 3, 3, '#e2be67');
}

{
    const zone = 'VUNGTAU_BAI_SAU';
    const c = zoneCanvases[zone].getContext('2d');
    drawVungTauCoast(c, zone);
    // Phố nghỉ dưỡng nhiều tầng ở phía trong, mở tầm nhìn từ đường dạo ra biển.
    drawVungTauHotel(c, 165, 176, 265, 246, '#f2d9b3', 'HẢI ÂU HOTEL');
    drawVungTauHotel(c, 515, 213, 220, 209, '#d8e1cc', 'BÌNH MINH');
    drawVungTauHotel(c, 1115, 163, 297, 259, '#e9c2a5', 'PHỐ BIỂN');
    drawVungTauHotel(c, 1530, 226, 245, 196, '#d9d4b8', 'SÓNG XANH');
    // Mái che cứu hộ, cờ bãi tắm, vòi tắm và ghế nghỉ nằm riêng trên nền cát.
    pOutlinedRect(c, 874, 467, 250, 87, '#f4e4c1');
    pOutlinedRect(c, 886, 479, 226, 63, '#487a82');
    c.font = "bold 18px 'Chakra Petch', sans-serif"; c.fillStyle = '#fff4d8'; c.textAlign = 'center';
    c.fillText('CỨU HỘ BÃI SAU', 999, 506);
    c.font = "bold 11px 'Chakra Petch', sans-serif";
    c.fillText('BÃI TẮM · PHỐ NGHỈ DƯỠNG', 999, 529);
    addCollider(zone, 874, 467, 250, 87);
    for (const [x, y, color] of [
        [255, 842, '#d46c53'], [610, 930, '#4b8c99'], [850, 845, '#e1a74c'],
        [1080, 930, '#4b8c99'], [1320, 852, '#e1a74c'], [1650, 963, '#c76d62']
    ]) drawBeachUmbrella(c, x, y, color);
    for (const [x, y] of [[403, 700], [1380, 700], [1780, 700]]) drawParkBench(c, x, y);
    for (const [x, color] of [[90, '#e85c45'], [820, '#edc34d'], [1880, '#e85c45']]) {
        pRect(c, x, 664, 3, 82, '#795a43'); pRect(c, x + 3, 666, 27, 20, color); pRect(c, x + 3, 686, 27, 4, '#fff1d1');
    }
    pOutlinedRect(c, 835, 702, 270, 34, '#467980');
    c.font = "bold 15px 'Chakra Petch', sans-serif"; c.fillStyle = '#fff2d6'; c.textAlign = 'center';
    c.fillText('BÃI SAU · VŨNG TÀU', 970, 725);
}
{
    const zone = 'VUNGTAU_FISHING';
    const c = zoneCanvases[zone].getContext('2d');
    drawVungTauCoast(c, zone);
    // Dãy nhà làng chài thấp phía sau chợ, mỗi căn có màu tường và mái khác nhau.
    for (const [x, wall, roof] of [[185, '#e0c69d', '#a65c48'], [475, '#c7d3ba', '#687d70'], [1370, '#e8d3ae', '#bd7050'], [1650, '#d6c4a3', '#79745c']]) {
        drawWeatheredWall(c, x, 265, 210, 131, wall, roof, '#f2dfbe');
        drawTiledRoof(c, x - 7, 245, 224, 31, roof, '#53443c');
        pOutlinedRect(c, x + 29, 306, 38, 38, '#88a5a0');
        pOutlinedRect(c, x + 142, 306, 38, 38, '#88a5a0');
        pOutlinedRect(c, x + 85, 346, 40, 50, '#705445');
        addCollider(zone, x, 270, 210, 126);
    }
    // Chợ thành nhiều lối song song, mái bạt sọc và quầy bán nhìn thấy rõ từ xa.
    drawFishingMarketStall(c, 228, 827, '#b54e45', 'CÁ TƯƠI');
    drawFishingMarketStall(c, 468, 918, '#4f8190', 'HÀU · SÒ');
    drawFishingMarketStall(c, 752, 827, '#cc8b3f', 'TÔM · MỰC');
    drawFishingMarketStall(c, 1020, 918, '#4d7660', 'HẢI SẢN');
    drawFishingMarketStall(c, 1290, 827, '#b45b58', 'CÁ KHÔ');
    drawFishingMarketStall(c, 1550, 918, '#668b91', 'ĐÁ LẠNH');
    // Bảng chợ lớn và lối gạch dẫn từ phố xuống phiên chợ.
    pOutlinedRect(c, 815, 443, 375, 92, '#76523c');
    pOutlinedRect(c, 824, 451, 357, 76, '#efe0b8');
    c.font = "bold 22px 'Chakra Petch', sans-serif"; c.fillStyle = '#8b382e'; c.textAlign = 'center';
    c.fillText('CHỢ CÁ LÀNG CHÀI', 1002, 482);
    c.font = "bold 12px 'Chakra Petch', sans-serif"; c.fillStyle = '#59483a';
    c.fillText('HẢI SẢN VỪA CẬP BẾN · MUA BÁN TỪ SÁNG SỚM', 1002, 507);
    addCollider(zone, 815, 443, 375, 92);
    for (let x = 930; x < 1080; x += 29) pRect(c, x, 540, 15, 42, '#e8d6b5');
    // Thúng chai, lưới và thuyền gỗ nằm dọc bờ nước; chừa lối đi thông thoáng.
    for (const [x, y, hull] of [[170, 1044, '#8a593a'], [540, 1060, '#b27646'], [1330, 1045, '#86533d'], [1710, 1060, '#b17643']]) {
        pRect(c, x + 8, y + 26, 180, 8, 'rgba(35,49,49,0.22)');
        pOutlinedRect(c, x, y, 188, 25, hull);
        pRect(c, x + 14, y + 5, 155, 5, '#e4c38a');
        pRect(c, x + 57, y - 12, 3, 18, '#684c39');
        pRect(c, x + 60, y - 12, 34, 15, '#e6d6ae');
        pRect(c, x + 42, y - 18, 65, 3, '#59483b');
        for (let i = 0; i < 4; i++) pRect(c, x + 22 + i * 38, y + 27, 2, 13, '#72553c');
    }
    pOutlinedRect(c, 906, 887, 54, 30, '#b99462');
    pRect(c, 913, 893, 40, 18, '#79a1a1');
    pOutlinedRect(c, 1184, 887, 54, 30, '#b99462');
    pRect(c, 1191, 893, 40, 18, '#e6d6ae');
    pOutlinedRect(c, 1000, 1090, 124, 24, '#b99462');
    for (const x of [1010, 1042, 1074]) pOutlinedRect(c, x, 1081, 22, 15, '#eee3c9');
}
{
    const zone = 'VUNGTAU_LIGHTHOUSE';
    const c = zoneCanvases[zone].getContext('2d');
    drawVungTauCoast(c, zone, 'cliff');
    // Mũi đất xanh xám nhô ra biển và đường dạo cong dẫn lên ngọn hải đăng.
    pOutlinedRect(c, 575, 656, 1190, 390, '#8a9185');
    pRect(c, 589, 670, 1160, 350, '#a9ae9b');
    for (let x = 610; x < 1730; x += 77) {
        pRect(c, x, 695 + (x % 5) * 11, 43, 8, '#79866e');
        pRect(c, x + 18, 723 + (x % 3) * 13, 30, 6, '#c3b89b');
    }
    pOutlinedRect(c, 934, 594, 260, 80, '#e5d7ba');
    pRect(c, 947, 605, 234, 58, '#c8b999');
    for (let y = 612; y < 660; y += 12) pRect(c, 958, y, 211, 3, '#eee3ca');
    // Lối bậc rộng uốn lên quảng trường, lan can sắt sơn trắng.
    for (let i = 0; i < 7; i++) {
        const x = 995 + i * 21, y = 988 - i * 42;
        pOutlinedRect(c, x, y, 190, 39, i % 2 ? '#d8d1bd' : '#eee7d5');
        pRect(c, x + 15, y + 8, 160, 3, '#bbb29e');
    }
    for (const x of [1008, 1164]) {
        pRect(c, x, 737, 5, 250, '#f0ead8');
        for (let y = 745; y < 990; y += 22) pRect(c, x - 3, y, 12, 4, '#f0ead8');
    }
    // Quảng trường ngắm biển, lan can và bảng tên địa danh trước chân tháp.
    pOutlinedRect(c, 1070, 695, 315, 69, '#70695e');
    pRect(c, 1080, 705, 295, 47, '#d6cbb3');
    pOutlinedRect(c, 640, 790, 365, 47, '#71513a');
    pOutlinedRect(c, 647, 797, 351, 33, '#f0d79e');
    c.font = "bold 16px 'Chakra Petch', sans-serif"; c.fillStyle = '#713c31'; c.textAlign = 'center';
    c.fillText('HẢI ĐĂNG VŨNG TÀU · 1862', 822, 819);
    drawRoundLighthouse(c, 1090, 707);
    addCollider(zone, 1082, 860, 128, 76);
    // Ghế đá và vườn hoa dọc đường ngắm biển.
    for (const x of [665, 826, 1460, 1640]) {
        pRect(c, x, 900, 88, 9, '#7a7265'); pRect(c, x + 8, 909, 7, 26, '#61594f'); pRect(c, x + 74, 909, 7, 26, '#61594f');
    }
    for (const x of [720, 1535]) {
        pOutlinedRect(c, x, 955, 112, 24, '#718b65');
        for (let i = 0; i < 6; i++) pRect(c, x + 9 + i * 16, 947 + (i % 2) * 3, 7, 8, i % 3 ? '#d37675' : '#edca74');
    }
    // Sân phơi muối nhỏ ở rìa đường bờ, cạnh bao muối để có điểm gom nguyên liệu.
    pOutlinedRect(c, 910, 1036, 210, 68, '#987d58');
    pRect(c, 920, 1046, 190, 48, '#eee7d4');
    for (let x = 930; x < 1100; x += 34) pRect(c, x, 1051, 23, 38, '#d5d0bd');
    for (const [x, y] of [[928, 1090], [978, 1090], [1028, 1090]]) {
        pOutlinedRect(c, x, y, 38, 42, '#e8ddc0'); pRect(c, x + 5, y + 7, 28, 24, '#f8f3e4');
    }
}
for (const zid of ['VILLAS', 'CANAL_MARKET']) {
    const c = zoneCanvases[zid].getContext('2d');
    const villas = zid === 'VILLAS';
    drawOpenWorldBase(c, zid, villas ? "#6c9b65" : "#78985a", "#60834f", "#d8bd99", "#655854");
    if (villas) {
        const villasOnAvenue = [
            ["BIỆT THỰ HOA GIẤY", "#e6c6aa"], ["BIỆT THỰ HOA PHÚ", "#dfd6b5"],
            ["BIỆT THỰ AN PHÚ", "#c9d8c6"], ["BIỆT THỰ GẠCH ĐỎ", "#dfb19d"],
            ["BIỆT THỰ NGỌC LAN", "#dbd0b9"], ["BIỆT THỰ HƯƠNG SỨ", "#c8d9df"],
            ["BIỆT THỰ BÌNH MINH", "#ead1a8"]
        ];
        villasOnAvenue.forEach(([name, color], index) => {
            drawVilla(c, 35 + index * 280, 58 + (index % 2) * 22, 240, name, color);
        });
        drawVilla(c, 345, 825, 282, "BIỆT THỰ VƯỜN MÂY", "#dcd3b7");
        drawVilla(c, 1395, 825, 282, "BIỆT THỰ TRÚC", "#d3d9bb");

        // Xe hơi & xe máy sang trọng đậu dọc đường Khu Biệt Thự
        const drawParkedCar = (px, py, bodyCol, roofCol) => {
            pRect(c, px + 4, py + 28, 84, 10, "rgba(0,0,0,0.28)");
            pOutlinedRect(c, px, py + 8, 92, 24, bodyCol);
            pOutlinedRect(c, px + 18, py, 52, 14, roofCol);
            pRect(c, px + 24, py + 3, 18, 8, "#b3e5fc");
            pRect(c, px + 46, py + 3, 18, 8, "#b3e5fc");
            pOutlinedRect(c, px + 12, py + 26, 16, 10, "#212121");
            pOutlinedRect(c, px + 64, py + 26, 16, 10, "#212121");
            addCollider(zid, px, py + 4, 92, 30);
        };
        const drawParkedBike = (px, py, bodyCol) => {
            pRect(c, px + 2, py + 18, 34, 6, "rgba(0,0,0,0.24)");
            pOutlinedRect(c, px + 6, py + 4, 24, 12, bodyCol);
            pOutlinedRect(c, px + 2, py + 12, 10, 8, "#212121");
            pOutlinedRect(c, px + 24, py + 12, 10, 8, "#212121");
            pRect(c, px + 22, py, 4, 6, "#cfd8dc");
            addCollider(zid, px + 2, py + 4, 32, 16);
        };
        drawParkedCar(250, 480, "#37474f", "#cfd8dc");
        drawParkedCar(1120, 480, "#8e2430", "#f5f5f5");
        drawParkedCar(1540, 695, "#1565c0", "#e3f2fd");
        drawParkedBike(560, 492, "#659ba5");
        drawParkedBike(920, 492, "#d84315");
        drawParkedBike(740, 704, "#fbc02d");
    } else {
        pRect(c, 0, 1080, WORLD_W, 320, "#43889c");
        pRect(c, 0, 1050, WORLD_W, 30, "#a99078");
        addCollider(zid, 0, 1080, WORLD_W, 320);
        const stalls = ["TIỆM GẠO", "HỦ TIẾU", "TẠP HÓA VEN KÊNH", "TIỆM CÁ", "TIỆM CHÈ"];
        stalls.forEach((title, index) => {
            const x = 390 + index * 244;
            drawFreestandingBuilding(c, zid, x, 790, 190, 110, {
                title, awning1: index % 2 ? "#769575" : "#d79154", awning2: "#f6d798"
            });
            drawParkBench(c, x, 990);
        });
    }
}

buildAllZonesOpenWorld();
// Nhà dân và cửa tiệm làm mốc, cách lối rẽ và các cửa thuê hiện có.
const additionalBuildings = {
    HOME_STREET: [[1650, 825, "NHÀ HẺM 54", "#dcb087"],
        [80, 242, "QUÁN ĂN SÁNG", "#dbad85"], [88, 792, "TIỆM SỬA XE", "#8dafa8"]],
    BETTER_STREET: [[1660, 845, "TIỆM HOA", "#d5a6aa"]],
    DOWNTOWN: [[1640, 860, "NHÀ SÁCH", "#a4b2bd"], [255, 840, "TIỆM MAY", "#d3ae83"], [465, 840, "TIỆM GIÀY", "#c9bca4"], [680, 840, "TIỆM TRANG SỨC", "#d4b8c3"]],
    OFFICE_DISTRICT: [[1665, 845, "VĂN PHÒNG", "#b2bec8"], [1630, 240, "CƠM TRƯA", "#d7b68f"]],
    DISTRICT_1: [
        [1135, 215, "NEON MƯA ĐÊM CLUB", "#503568", 340, 155],
        [1600, 230, "QUÁN NƯỚNG", "#79534f"], [242, 840, "NHÀ HÁT", "#855568"],
        [455, 830, "ỐC & LẨU ĐÊM BỜ KÈ", "#6c4e5f", 340, 150],
        [1645, 850, "BIA SÂN THƯỢNG", "#60495f"]
    ],
    ELDERLY_AREA: [
        [70, 55, "NHÀ CỔ", "#b8a184"], [295, 54, "NHÀ GỖ", "#c2ac87"],
        [520, 55, "NHÀ HOA GIẤY", "#d0a49d"], [745, 57, "NHÀ HƯƠNG MỘC", "#b8b395"],
        [970, 55, "DINH THỰ TÂN CỔ", "#dfcda8"], [1195, 54, "NHÀ XƯA", "#c3b398"],
        [1420, 55, "NHÀ VƯỜN", "#afbc99"], [1645, 55, "BIỆT THỰ CỔ", "#d2c3a9"],
        [890, 225, "NHÀ GẠCH MỘC", "#c2a089"], [1150, 225, "NHÀ PHÁP CỔ", "#d3bca5"],
        [1425, 225, "TIỆM TRÀ", "#c3ad8d"], [1665, 225, "TIỆM ĐỒ CỔ", "#c9a29e"]
    ],
    BREEZE_AREA: [[1690, 235, "NHÀ VEN BIỂN", "#a6c3c7"]],
    CANAL_MARKET: [
        [110, 245, "NHÀ VEN KÊNH", "#d3b696"], [315, 245, "NHÀ GỖ", "#cdbb8f"],
        [520, 245, "NHÀ CỔ", "#c2a08d"], [720, 245, "NHÀ VEN KÊNH", "#aabc96"],
        [1135, 245, "NHÀ BỜ KÈ", "#b2c5b5"], [1340, 245, "NHÀ XƯA", "#aac0c5"],
        [1545, 245, "NHÀ HỒNG", "#d3a1a1"], [1750, 245, "NHÀ VEN KÊNH", "#d4be9e"]
    ]
};
for (const [zone, buildings] of Object.entries(additionalBuildings)) {
    const c = zoneCanvases[zone].getContext('2d');
    for (const [x, y, title, wallCol, customW, customH] of buildings) {
        const sign = zone === 'DISTRICT_1' ? { signBg: '#542a6b', signBorder: '#6addcf' } : {};
        drawFreestandingBuilding(c, zone, x, y, customW || 160, customH || 140, { title, wallCol, ...sign });
    }
}
// Bàn ghế ăn ngoài trời xung quanh & phía trước Quán Nướng (Quận 1)
{
    const d1 = zoneCanvases.DISTRICT_1.getContext('2d');
    const bbqTables = [[1524, 315], [1545, 405], [1730, 405], [1786, 315]];
    for (const [tx, ty] of bbqTables) {
        pOutlinedRect(d1, tx, ty, 44, 30, "#6d4c41");
        pRect(d1, tx + 4, ty + 4, 36, 22, "#f5e1c8");
        pOutlinedRect(d1, tx + 15, ty + 9, 14, 12, "#d84315");
        pRect(d1, tx + 18, ty + 12, 8, 6, "#ffab40");
        pOutlinedRect(d1, tx + 14, ty - 10, 16, 8, "#8d6e63");
        pOutlinedRect(d1, tx + 14, ty + 32, 16, 8, "#8d6e63");
        addCollider('DISTRICT_1', tx, ty, 44, 30);
    }
}
const officeCanvas = zoneCanvases.OFFICE_DISTRICT.getContext('2d');
const officeColors = ["#718b9d", "#9a9995", "#68838c", "#918b9f"];
for (let x = 20, i = 0; x < 1850; x += 186, i++) {
    drawTower(officeCanvas, 'OFFICE_DISTRICT', x, 168, 145 + (i % 3) * 15, officeColors[i % 4]);
}

// ============================================================================
// HỆ THỐNG THỜI GIAN CHUẨN STARDEW VALLEY, ĐI CHỢ, PHA CHẾ & NGỦ CUỐI NGÀY
// ============================================================================

function formatGameClock(hourFloat) {
    const wrapped = ((hourFloat % 24) + 24) % 24;
    let h = Math.floor(wrapped);
    let m = Math.floor((wrapped - h) * 60);
    // Làm tròn theo bước 10 phút giống Stardew Valley (05:00, 05:10, 05:20...)
    m = Math.floor(m / 10) * 10;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    let period = "SÁNG";
    if (wrapped < 5.0) period = "ĐÊM";
    else if (wrapped >= 11.0 && wrapped < 13.5) period = "TRƯA";
    else if (wrapped >= 13.5 && wrapped < 18.0) period = "CHIỀU";
    else if (wrapped >= 18.0) period = "TỐI";
    return hh + ":" + mm + " " + period;
}

function formatDeadlineClock(hourInt) {
    const h = ((Math.floor(hourInt) % 24) + 24) % 24;
    return String(h).padStart(2, '0') + ':00';
}

function getNextMorningWakeHour(sleepHour = playerStats.hour) {
    if (sleepHour < 23.5) return GAME_CONFIG.TIME.WAKE_UP_HOUR;
    const extraLateHours = Math.max(0, sleepHour - GAME_CONFIG.TIME.SLEEP_PENALTY_LIMIT);
    const rawWake = GAME_CONFIG.TIME.LATE_WAKE_UP_HOUR + extraLateHours;
    // Làm tròn theo bước 10 phút và giới hạn muộn nhất là 18:00
    const snapped = Math.round(rawWake * 6) / 6;
    return Math.min(18.0, snapped);
}

let midnightNotifiedToday = false;

function updateGameTime(deltaSeconds) {
    if (currentGameState !== GAME_STATES.PLAYING_HOME && currentGameState !== GAME_STATES.PLAYING_STREET) return;
    if (isTimePausedModalOpen()) return; // Menu pha chế góc màn hình không đóng băng thời gian để bạn thấy khách tới mua

    const realSecPerHour = GAME_CONFIG.TIME.REAL_SECONDS_PER_GAME_HOUR || 30;
    const hoursAdded = (deltaSeconds / realSecPerHour) * playerStats.timeSpeedMultiplier;
    playerStats.hour += hoursAdded;

    if (yearTwo.travel === 'outbound' && playerStats.hour >= 18) {
        playerStats.hour = 18;
        startBusScene('Về bến xe Sài Gòn', '18:00 → 19:00', arriveByBus);
        return;
    }

    // Qua 12h đêm vẫn tiếp tục chơi bình thường, không tự động ngủ hay tự động save
    if (!midnightNotifiedToday && playerStats.hour >= GAME_CONFIG.TIME.SLEEP_PENALTY_LIMIT) {
        midnightNotifiedToday = true;
        showToast("🌙 Đã qua 00:00 Đêm! Bạn vẫn có thể chơi tiếp, nhưng ngủ càng muộn sáng mai sẽ dậy càng trễ.", 240);
    }
}

function triggerSleepSummary(isLateForced = false) {
    closeAllModals();
    faintedInHospital = false;
    sleepForcedByMidnight = Boolean(isLateForced);
    dailyReport.latePenalty = isLateForced || (playerStats.hour >= 23.5);
    showSleepSummaryModal = true;
    GameAudio?.playSleep();
}

function triggerHospitalization() {
    if (showSleepSummaryModal) return;
    closeAllModals();
    if (indoorShop) {
        indoorShop = null;
        outdoorPosition = null;
    }
    ridingBicycle = false;
    activeVehicle = null;
    activeBrewSpot = null;
    if (coffeeCart.isPushed) {
        coffeeCart.isPushed = false;
        coffeeCart.zone = 'HOME_STREET';
        coffeeCart.x = 1110;
        coffeeCart.y = 382;
    }

    currentGameState = GAME_STATES.PLAYING_STREET;
    currentZone = BETTER_HOSPITAL.zone;
    player.x = BETTER_HOSPITAL.doorX;
    player.y = BETTER_HOSPITAL.doorY;
    player.dir = 'down';
    nearbyInteractable = null;

    playerStats.energy = 0;
    const chargedHospitalFee = Math.min(Math.max(0, playerStats.money), HOSPITAL_FEE);
    playerStats.money = Math.max(0, playerStats.money - chargedHospitalFee);
    dailyReport.hospitalCost += chargedHospitalFee;
    dailyReport.latePenalty = true;
    faintedInHospital = true;
    sleepForcedByMidnight = true;
    showSleepSummaryModal = true;

    addScreenPopup(110, 56, `-${chargedHospitalFee.toLocaleString('vi-VN')}đ`, "#e74c3c");
    GameAudio?.playError();
    GameAudio?.playSleep();
    showToast(`🚑 Bạn đã kiệt sức và ngất xỉu! Nhập viện tại Khu Phố Đắt Hơn (-${chargedHospitalFee.toLocaleString('vi-VN')}đ viện phí).`, 280);
}

function confirmStartNextDay() {
    const wokeAtHospital = faintedInHospital;
    faintedInHospital = false;
    showSleepSummaryModal = false;
    sleepForcedByMidnight = false;
    GameAudio?.playWakeUp();
    if (indoorShop) leaveShop();
    festivalChoice = null;
    festivalPartner = null;
    festivalResult = null;
    clearFestivalOrders();
    ridingBicycle = false;
    activeVehicle = null;
    activeBrewSpot = null;
    if (coffeeCart.isPushed) {
        coffeeCart.isPushed = false;
        coffeeCart.zone = 'HOME_STREET';
        coffeeCart.x = 1110;
        coffeeCart.y = 382;
    }
    coffeeCart.isOpen = !coffeeCart.seized;
    cartServiced = false;
    deliveryOffers = [];
    activeDeliveryOrder = null;
    deliveryCompletedToday = 0;
    playerStats.day += 1;
    playerStats.dayOfYear += 1;
    if (playerStats.dayOfYear > GAME_CONFIG.TIME.DAYS_PER_YEAR) {
        playerStats.dayOfYear = 1;
        playerStats.year += 1;
        yearFestivals = rollYearFestivals();
        if (playerStats.year === 2 && !yearTwo.introSeen) {
            yearTwo.introSeen = true;
            if (YEAR_TWO_PREVIEW) {
                yearTwo.showTrailer = true;
            } else {
                yearOneSummarySeen = true;
                showYearSummaryModal = true;
            }
        }
    }
    ensureChapterProgress(true);

    if (weddingDay !== null && playerStats.day >= weddingDay && getTodayFestival()) {
        weddingDay = playerStats.day + 1;
    }

    // Cập nhật thời tiết hôm nay & dự báo ngày mai + biến cố thị trường
    playerStats.weather = playerStats.tomorrowWeather || rollSaigonWeather(playerStats.dayOfYear);
    const nextDayNum = (playerStats.dayOfYear % GAME_CONFIG.TIME.DAYS_PER_YEAR) + 1;
    playerStats.tomorrowWeather = rollSaigonWeather(nextDayNum);
    const wInfo = getWeatherInfo();
    dailyEvent = rollDailyEvent();
    dailyQuest = rollDailyQuest();
    vipSpawnedToday = false;
    vipRushTimer = 0;
    lowEnergyWarned = false;
    const finishedTutorialToday = completeTutorialStep(5);

    // Reset trạng thái trò chuyện / tặng quà mỗi ngày cho tất cả nhân vật
    [...storyNPCs, ...streetCustomers, vendorNPC].forEach((n) => {
        n.talkedToday = false;
        n.giftedToday = false;
    });

    let morningMsg = "";
    const wakeHour = getNextMorningWakeHour(playerStats.hour);
    midnightNotifiedToday = false;
    if (wokeAtHospital) {
        playerStats.hour = Math.max(GAME_CONFIG.TIME.LATE_WAKE_UP_HOUR, wakeHour);
        playerStats.energy = playerStats.maxEnergy;
        morningMsg = `🏥 Năm ${playerStats.year} • Ngày ${playerStats.dayOfYear}/100 (${wInfo.icon} ${wInfo.name}) - Xuất viện lúc ${formatGameClock(playerStats.hour)} (100% Thể lực)!`;
    } else if (dailyReport.latePenalty) {
        playerStats.hour = wakeHour;
        playerStats.energy = Math.round(playerStats.maxEnergy * 0.75);
        morningMsg = `⏰ Năm ${playerStats.year} • Ngày ${playerStats.dayOfYear}/100 (${wInfo.icon} ${wInfo.name}) - Dậy muộn lúc ${formatGameClock(playerStats.hour)} (75% Thể lực)!`;
    } else {
        playerStats.hour = GAME_CONFIG.TIME.WAKE_UP_HOUR; // Dậy đúng 05:00 sáng
        playerStats.energy = playerStats.maxEnergy;
        morningMsg = `${wInfo.icon} Năm ${playerStats.year} • Ngày ${playerStats.dayOfYear}/100 (${wInfo.name})! Chợ sớm giảm 20% trước 8h.`;
    }

    // Reset thống kê ngày mới trước khi quyết toán doanh nghiệp/thuê mặt bằng sáng hôm nay
    dailyReport = {
        cupsSold: 0,
        revenue: 0,
        ingredientCost: 0,
        rentCost: 0,
        hospitalCost: 0,
        latePenalty: false
    };
    dailyRegularOrders = 0;
    regularContractPaid = false;

    settleBusinesses();
    if (finishedTutorialToday) {
        businessNews.unshift("🎓 Hoàn thành Tân Thủ (+500.000đ & +2 Danh tiếng)");
    }
    const spoiled = processDailyIngredientSpoilage();
    const spoiledParts = [];
    if (spoiled.coffee) spoiledParts.push(`${spoiled.coffee} 🫘 Cà phê`);
    if (spoiled.milk) spoiledParts.push(`${spoiled.milk} 🥫 Sữa`);
    if (spoiled.fruit) spoiledParts.push(`${spoiled.fruit} 🍊 Cam`);
    if (spoiledParts.length) {
        businessNews.push(`🗑️ Hư hỏng qua đêm: ${spoiledParts.join(', ')}`);
    }
    if(bankDebt>0){
        const dueToday = Math.min(bankDebt, dailyLoanPayment);
        if(playerStats.money>=dueToday){playerStats.money-=dueToday;bankDebt-=dueToday;creditScore=Math.min(100,creditScore+1);businessNews.push(`VietBank đã thu ${moneyLabel(dueToday)} tiền góp.`);}
        else {creditScore=Math.max(0,creditScore-5);addCityReputation(-5);businessNews.push("Quá hạn VietBank · tín dụng -5, danh tiếng -5.");}
        if(bankDebt<=0){bankDebt=0;dailyLoanPayment=0;creditScore=Math.min(100,creditScore+5);businessNews.push("Đã tất toán khoản vay · hồ sơ tín dụng tăng.");}
    }
    if (spouse && Object.keys(rentedProperties).length) {
        const profile=marriageProfiles[spouse.id];
        if(playerStats.day%7===0) businessNews.push(`${spouse.name} phụ quản lý khách và kho, danh tiếng được giữ ổn định.`);
        if(profile && playerStats.day%14===0) customerReputation=Math.min(100,customerReputation+2);
    }
    const birthdaySummary = grantPlayerBirthdayRewards();
    if (birthdaySummary) {
        playerStats.energy = playerStats.maxEnergy;
        businessNews.push(birthdaySummary);
    }
    const eventTag = dailyEvent ? ` · ${dailyEvent.icon} ${dailyEvent.title}: ${dailyEvent.desc}` : "";
    const cloudTag = window.GameCloud?.isLoggedIn() ? ` · ☁️ Lưu Ô ${GameCloud.activeSlot + 1}` : "";
    if (businessNews.length) {
        showToast(`${morningMsg}${eventTag} · ${businessNews.join(" · ")}${cloudTag}`, 400);
    } else {
        showToast(`${morningMsg}${eventTag}${cloudTag}`, dailyEvent ? 360 : 260);
    }

    // Đưa người chơi về cạnh giường trong phòng ngủ (hoặc vào phòng cấp cứu bệnh viện nếu vừa nhập viện)
    if (wokeAtHospital) {
        const hospitalShop = (shopsByZone[BETTER_HOSPITAL.zone] || []).find((s) => s.name.includes("BỆNH VIỆN"));
        currentGameState = GAME_STATES.PLAYING_STREET;
        currentZone = BETTER_HOSPITAL.zone;
        if (hospitalShop) {
            indoorShop = hospitalShop;
            hospitalFloor = 0;
            outdoorPosition = { x: BETTER_HOSPITAL.doorX, y: BETTER_HOSPITAL.doorY };
            lyingOnHospitalBed = true;
            player.x = 244;
            player.y = 324;
            player.dir = 'left';
            const doctorNpc = storyNPCs.find((n) => n.id === 'bac_si_tuan');
            if (doctorNpc) {
                doctorNpc.briefingLines = [
                    "Anh đã làm việc quá sức, phí hồi sức là 1 triệu đồng.",
                    "Lần sau nhớ ăn uống đầy đủ và nghỉ ngơi trước khi cạn kiệt sức lực nhé!"
                ];
                openNPCDialogue(doctorNpc);
            }
        } else {
            player.x = BETTER_HOSPITAL.doorX;
            player.y = BETTER_HOSPITAL.doorY;
            player.dir = 'down';
        }
    } else {
        currentGameState = GAME_STATES.PLAYING_HOME;
        player.x = 301;
        player.y = 199;
        player.dir = 'down';
    }
    if (window.GameCloud?.isLoggedIn()) {
        GameCloud.saveSlot(GameCloud.activeSlot, exportSaveData()).then((res) => {
            if (!res.ok) showToast(`⚠️ Chưa lưu được lên Cloud: ${res.error}`, 260);
        });
    }
}

function getMarketItemPrice(item) {
    const isEarlyBird = playerStats.hour < GAME_CONFIG.TIME.EARLY_MARKET_BONUS_HOUR;
    let price = isEarlyBird ? Math.round(item.basePrice * 0.8) : item.basePrice;
    if (dailyEvent?.marketMult) price = Math.round(price * dailyEvent.marketMult / 1000) * 1000;
    else if (dailyEvent?.fruitMult && item.id === 'fruit') price = Math.round(price * dailyEvent.fruitMult / 1000) * 1000;
    return price;
}

function buyIngredientAtMarket(item) {
    if (playerStats.hour >= GAME_CONFIG.TIME.MARKET_CLOSE_HOUR) {
        GameAudio?.playError();
        showToast("🌙 Tiệm Tạp Hóa Cô Ba đã đóng cửa sau 18:30! Hãy quay lại lúc 05:00 sáng mai.");
        return;
    }
    const price = getMarketItemPrice(item);
    if (playerStats.money < price) {
        GameAudio?.playError();
        showToast("⚠️ Bạn không đủ tiền mua [" + item.name + "]!");
        return;
    }

    playerStats.money -= price;
    dailyReport.ingredientCost += price;

    // Hiện hiệu ứng đã trừ tiền (-) và cộng món đồ (+) rõ ràng trên màn hình
    addScreenPopup(110, 56, "-" + price.toLocaleString('vi-VN') + "đ", "#e74c3c");

    if (item.energyRestore) {
        GameAudio?.playEat();
        playerStats.energy = Math.min(playerStats.maxEnergy, playerStats.energy + item.energyRestore);
        addScreenPopup(260, 56, "+" + item.energyRestore + " ⚡ Thể lực", "#2ecc71");
        showToast("🥖 Đã ăn " + item.name + "! Hồi phục +" + item.energyRestore + " ⚡ Thể lực.");
    } else {
        GameAudio?.playBuy();
        addInventory(item.id, item.packAmount);
        if (item.id === 'fruit') recipeQuestStats.fruitBought += 1;
        addScreenPopup(560, 56, "+" + item.packAmount + " " + item.icon + " " + item.name, "#2ecc71");
        showToast("🛒 Đã mua +" + item.packAmount + " phần [" + item.name + "] (-" + price.toLocaleString('vi-VN') + "đ)");
    }
    completeTutorialStep(1);
    checkRecipeUnlockQuests();
}

function clearFestivalOrders() {
    for (const customer of streetCustomers) {
        if (customer.targetSpotId !== 'festival_stall') continue;
        customer.state = 'wandering';
        customer.targetSpotId = null;
    }
}

function openFestivalPanel() {
    closeAllModals();
    showFestivalPanel = true;
}

function openFestivalStall() {
    closeAllModals();
    activeBrewSpot = { spotId: 'festival_stall', name: 'Quầy cà phê lễ hội', zoneId: 'PARK' };
    showBrewModal = true;
}

function getFestivalBeat() {
    return ((performance.now() - festivalRoundStarted) % 1600) / 1600;
}

function handleFestivalClick(x, y) {
    if (x >= 775 && x <= 862 && y >= 124 && y <= 159) {
        showFestivalPanel = false;
        return;
    }
    const festival = getTodayFestival();
    if (!festival || playerStats.hour < 9 || playerStats.hour >= 21) return;

    if (!festivalChoice && y >= 238 && y <= 293) {
        if (x >= 168 && x <= 475) festivalChoice = 'play';
        if (x >= 525 && x <= 832) {
            festivalChoice = 'sell';
            spotOrderCooldown = 60;
            showFestivalPanel = false;
            showToast("☕ Quầy lễ hội đã mở, ở bên phải quảng trường.");
        }
        return;
    }
    if (festivalChoice !== 'play' || festivalResult !== null) return;
    if (!festivalPartner) {
        const partner = getFestivalAttendees(festival).find((npc, index) =>
            x >= 235 && x <= 765 && y >= 234 + index * 45 && y <= 271 + index * 45
        );
        if (partner) {
            festivalPartner = partner;
            festivalRoundStarted = performance.now();
        }
    } else if (x >= 355 && x <= 645 && y >= 367 && y <= 420) {
        const beat = getFestivalBeat();
        const isGood = beat >= 0.39 && beat <= 0.61;
        festivalResult = isGood ? 60 : 25;
        festivalPartner.friendship += festivalResult;
        checkNPCFriendshipMilestone(festivalPartner);
        if (isGood) addCityReputation(2);
        GameAudio?.playFestivalHit(isGood);
    }
}

function drawFestivalPanel() {
    if (!showFestivalPanel) return;
    const festival = getTodayFestival();
    if (!festival) return;
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(24,18,15,0.78)");
    drawStandardModalFrame({
        x: 135,
        y: 110,
        w: 730,
        h: 420,
        title: festival.name,
        titleSize: 20,
        closeButton: false
    });
    ctx.textAlign = "center";
    pOutlinedRect(ctx, 775, 124, 87, 35, '#c84b31');
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG [Q]", 818, 147);
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    if (playerStats.hour < 9 || playerStats.hour >= 21) {
        ctx.fillText("Lễ hội mở từ 09:00 đến 21:00.", 500, 220);
    } else if (!festivalChoice) {
        ctx.fillText("Chọn một hoạt động cho lễ hội hôm nay", 500, 216);
        pOutlinedRect(ctx, 168, 238, 307, 55, "#f0b643");
        pOutlinedRect(ctx, 525, 238, 307, 55, "#aaca8c");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText("Chơi cùng NPC", 321, 271);
        ctx.fillText("Bán cà phê", 678, 271);
        ctx.fillText("Chơi để tăng thân thiết hoặc mở quầy bán hàng ở quảng trường.", 500, 330);
    } else if (festivalChoice === 'sell') {
        ctx.fillText("Mày đã chọn bán cà phê. Quầy ở bên phải quảng trường.", 500, 228);
    } else if (festivalResult !== null) {
        ctx.fillText(`Chơi cùng ${festivalPartner.name} · +${festivalResult} điểm thân thiết`, 500, 235, 630);
    } else if (!festivalPartner) {
        ctx.fillText(festival.game + " · Chọn người chơi cùng", 500, 219);
        getFestivalAttendees(festival).forEach((npc, index) => {
            pOutlinedRect(ctx, 235, 234 + index * 45, 530, 37, "#ecd3ab");
            ctx.fillStyle = PAL.OUTLINE;
            ctx.fillText(npc.name, 500, 258 + index * 45);
        });
    } else {
        ctx.fillText(`${festival.game} cùng ${festivalPartner.name}`, 500, 225, 630);
        ctx.fillText("Bấm khi vạch trắng chạy vào vùng xanh.", 500, 266);
        pOutlinedRect(ctx, 250, 301, 500, 30, "#8c5d47");
        pRect(ctx, 445, 303, 110, 26, "#4f8a46");
        pRect(ctx, 251 + getFestivalBeat() * 493, 303, 5, 26, "#fff6e5");
        pOutlinedRect(ctx, 355, 367, 290, 53, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText("Bấm đúng nhịp", 500, 400);
    }
}

function getWaitingCustomersAtSpot(spotId) {
    return streetCustomers.filter((c) => c.state === 'waiting_order' && c.targetSpotId === spotId);
}

function brewAndSellDrink(recipe) {
    if (!recipe) return;
    if (!isRecipeUnlocked(recipe.id)) {
        GameAudio?.playClick();
        showToast(getRecipeQuestHint(recipe.id), 300);
        return;
    }
    if (currentZone === 'PARK' && getTodayFestival() &&
        (activeBrewSpot?.spotId !== 'festival_stall' || festivalChoice !== 'sell' || playerStats.hour < 9 || playerStats.hour >= 21)) {
        showToast("Chọn bán cà phê và dùng quầy lễ hội từ 09:00 đến 21:00.");
        return;
    }
    const spotId = activeBrewSpot ? activeBrewSpot.spotId : null;
    const waitingHere = spotId ? getWaitingCustomersAtSpot(spotId) : [];

    // Bắt buộc phải có khách đứng tại quầy gọi món mới được bán
    if (waitingHere.length === 0) {
        GameAudio?.playError();
        showToast("⏳ Chưa có khách lại quầy gọi món! Hãy đợi khách đi tới quầy nhé.");
        return;
    }

    const matchedCustomer = waitingHere.find((c) => getRecipeByIndex(c.wantedRecipeIdx).id === recipe.id);
    if (!matchedCustomer) {
        GameAudio?.playError();
        const wantedNames = waitingHere.map((c) => getRecipeByIndex(c.wantedRecipeIdx).name).join(', ');
        showToast("⚠️ Khách tại quầy đang gọi [" + wantedNames + "], không phải món này!");
        return;
    }

    const help = spouse && spotId === 'cart_mobile' && !Object.keys(rentedProperties).length
        ? marriageProfiles[spouse.id][1] : 0;
    const prevRank = getBaristaRank();
    const energyCost = Math.max(1, recipe.energyCost - help - prevRank.energySave - (businesses[spotId]?.upgrades?.machine?1:0));
    if (playerStats.energy <= 0) {
        triggerHospitalization();
        return;
    }

    // Kiểm tra nguyên liệu
    for (const [ingId, reqCount] of Object.entries(recipe.need)) {
        if ((inventory[ingId] || 0) < reqCount) {
            GameAudio?.playError();
            showToast("⚠️ Thiếu nguyên liệu! Ghé Tiệm Cô Ba (phía Nam Hẻm 54, mở 05:00–18:30) để mua thêm.");
            return;
        }
    }

    GameAudio?.playBrew();
    setTimeout(() => GameAudio?.playCoin(), 200);

    // Trừ nguyên liệu & thể lực, cộng thời gian pha chế (10 phút game)
    for (const [ingId, reqCount] of Object.entries(recipe.need)) {
        consumeInventory(ingId, reqCount);
    }
    playerStats.energy = Math.max(0, playerStats.energy - energyCost);
    playerStats.hour += (help ? 5 : 10) / 60;

    // Tính giá bán theo hệ số Khu Phố + Cấp Barista
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const mult = zInfo && zInfo.priceMultiplier ? zInfo.priceMultiplier : 1.0;
    const business=businesses[spotId];
    const upgrades=business?.upgrades||{};
    const partnerShare = business?.partner?.share || 0;
    const reputationBonus=1+Math.min(0.15,customerReputation/500);
    const eventPriceMult = getDailyEventPriceMult(currentZone);
    const grossPrice = Math.round(recipe.baseSellPrice * mult * eventPriceMult * priceOptions[dailyPriceIndex] * reputationBonus * prevRank.priceMult / 1000) * 1000;
    const regularBonus = matchedCustomer.isRegularOrder ? Math.round(grossPrice * 0.1) : 0;
    const spouseCafeBonus = spouse && businesses[spotId]?.type.id === 'cafe' ? Math.round(grossPrice * 0.1) : 0;
    const cartSeatingTip = spotId === 'cart_mobile' && coffeeCart.seating ? 2000 : 0;
    const isVip = Boolean(matchedCustomer.isVipReviewer);
    const vipTip = isVip ? Math.round(grossPrice * 0.8) : 0;
    const finalPrice = grossPrice + regularBonus + spouseCafeBonus + cartSeatingTip + vipTip - Math.round(grossPrice * partnerShare);

    playerStats.money += finalPrice;
    recordChapterAction('sales');
    dailyReport.cupsSold += 1;
    dailyReport.revenue += finalPrice;
    totalCupsSold += 1;
    totalRevenueEarned += finalPrice;
    const newRank = getBaristaRank();
    if (newRank.level > prevRank.level) {
        addCityReputation(3);
        GameAudio?.playUnlock();
        addScreenPopup(500, 180, `🏆 LÊN CẤP BARISTA LV.${newRank.level}: ${newRank.name}!`, "#f0b643");
        showToast(`🏆 Chúc mừng lên cấp Barista Lv.${newRank.level} (${newRank.name})! Giá bán x${newRank.priceMult.toFixed(2)}, +3 Danh tiếng!`, 300);
    }
    if (isVip) {
        matchedCustomer.isVipReviewer = false;
        customerReputation = Math.min(100, customerReputation + 6);
        addCityReputation(2);
        vipRushTimer = 3600;
        GameAudio?.playUnlock();
        addScreenPopup(500, 152, "⭐ FOOD REVIEWER HÀI LÒNG! +2 Danh tiếng & Giờ Cao Điểm!", "#f0b643");
    }
    recordDailyQuestProgress('sell_zone', { zone: currentZone });
    recordDailyQuestProgress('sell_drink', { recipeId: recipe.id });
    if (matchedCustomer.isRegularOrder) {
        matchedCustomer.isRegularOrder = false;
        dailyRegularOrders += 1;
        recordChapterAction('regulars');
        if (dailyRegularOrders >= 3 && !regularContractPaid) {
            const reward = 250000;
            playerStats.money += reward;
            dailyReport.revenue += reward;
            customerReputation = Math.min(100, customerReputation + 4);
            addCityReputation(1);
            regularContractPaid = true;
            showToast(`Khách quen đủ 3/3 đơn · thưởng hợp đồng ${moneyLabel(reward)} & +1 Danh tiếng!`);
        }
    }
    const satisfaction=priceOptions[dailyPriceIndex] > 1.1 ? -1 : 1;
    customerReputation=Math.max(0,Math.min(100,customerReputation+satisfaction+(upgrades.seating?1:0)));
    if(satisfaction>0 && customerReputation>=12 && Math.random()<0.16){
        const regular=storyNPCs.find(n=>n.friendship>=80&&n.birthday!==playerStats.dayOfYear);
        if(regular){regular.friendship+=1;showToast(`${regular.name} thành khách quen của quán.`);}
    }

    // Hiện hiệu ứng + tiền & - nguyên liệu / thể lực trên HUD
    addScreenPopup(110, 56, "+" + finalPrice.toLocaleString('vi-VN') + "đ", "#2ecc71");
    addScreenPopup(260, 56, "-" + energyCost + " ⚡", "#e67e22");
    const ingUsedText = Object.entries(recipe.need).map(([k, v]) => {
        const ic = k === 'coffee' ? '🫘' : (k === 'milk' ? '🥫' : '🍊');
        return `-${v} ${ic}`;
    }).join("  ");
    addScreenPopup(560, 56, ingUsedText, "#e74c3c");

    // Khách nhận nước xong, vui vẻ rời quầy
    addFloatingText(matchedCustomer.x + 18, matchedCustomer.y - 18, "Cảm ơn! +" + finalPrice.toLocaleString('vi-VN') + "đ", "#2ecc71");
    matchedCustomer.state = 'leaving';
    matchedCustomer.targetSpotId = null;
    matchedCustomer.orderTimer = 0;
    matchedCustomer.dir = Math.random() < 0.5 ? 1 : -1;
    matchedCustomer.wantedRecipeIdx = Math.floor(Math.random() * getAvailableRecipes().length);

    showToast(recipe.icon + " Đã phục vụ [" + recipe.name + "] thu về +" + finalPrice.toLocaleString('vi-VN') + "đ!", 160);
    if (currentZone !== 'HOME_STREET') recipeQuestStats.cupsOutsideHome += 1;
    if (recipe.id === 'tra_cam_sa') recipeQuestStats.traCamSaSold += 1;
    completeTutorialStep(2);
    checkRecipeUnlockQuests();
    if (playerStats.energy > 0 && playerStats.energy <= 20 && !lowEnergyWarned) {
        lowEnergyWarned = true;
        showToast("⚡ Thể lực sắp cạn (<20)! Ăn Bánh Mì ở Cô Ba hoặc về giường ngủ kẻo ngất mất 1 triệu viện phí!", 280);
    }
    if (playerStats.energy <= 0) {
        triggerHospitalization();
    }
}

function startBusScene(title, schedule, onArrival) {
    if (indoorShop) leaveShop();
    closeAllModals();
    resetAllMovementKeys();
    busScene = { title, schedule, onArrival, started: performance.now() };
}

function departByBus(route) {
    if (playerStats.hour > 9 || playerStats.money < 200000) {
        showBusRoutes = false;
        showToast(playerStats.hour > 9 ? 'Đã lỡ chuyến 09:00. Hẹn sáng mai!' : 'Vé khứ hồi giá 200.000đ.');
        return;
    }
    playerStats.money -= 200000;
    playerStats.hour = 9;
    activeVehicle = null;
    yearTwo.destination = route.id;
    startBusScene('Đi ' + route.name, '09:00 → 10:00', () => {
        yearTwo.travel = 'outbound';
        yearTwo.province = route.id;
        playerStats.hour = 10;
        switchZone(route.zone, 960, 900, 'down');
        showToast('Chuyến về rời tỉnh lúc 18:00.', 300);
    });
}

function arriveByBus() {
    playerStats.hour = 19;
    yearTwo.travel = null;
    yearTwo.province = null;
    switchZone(busTerminal.zone, busTerminal.arrivalX, busTerminal.arrivalY, 'up');
    let unpacked = 0;
    for (const [item, count] of Object.entries(yearTwo.bag)) {
        yearTwo.stocks[item] = (yearTwo.stocks[item] || 0) + count;
        yearTwo.bag[item] = 0;
        unpacked += count;
    }
    showToast('Đã về bến xe Sài Gòn lúc 19:00.' +
        (unpacked ? ' Đã nhập kho ' + unpacked + ' đơn vị đặc sản.' : ''), 300);
}

function triggerInteractable(inter) {
    if (!inter) return;
    if (inter.type === 'BUS') {
        if (playerStats.year < 2) {
            showToast('Bến xe liên tỉnh mở cửa từ Năm 2.');
            return;
        }
        resetAllMovementKeys();
        showBusRoutes = true;
    } else if (inter.type === 'BACKPACK') {
        if (playerStats.year < 2 && playerStats.dayOfYear < 75) { showToast('Ba lô đi tỉnh sẽ mở bán ở Cô Ba vào ngày 75.'); return; }
        if (yearTwo.backpack) { showToast('Ba lô đã mua · sức chứa 8 đơn vị đặc sản.'); return; }
        if (playerStats.money < 250000) { showToast('Ba lô giá 250.000đ. Chưa đủ tiền.'); return; }
        playerStats.money -= 250000;
        yearTwo.backpack = true;
        GameAudio?.playBuy();
        addScreenPopup(110, 56, "-250.000đ", "#e74c3c");
        showToast('🎒 Đã mua ba lô đi tỉnh · sức chứa tối đa 8 đơn vị đặc sản các tỉnh.');
    } else if (inter.type === 'SPECIALTY') {
        if (!yearTwo.backpack) { showToast('Cần ba lô để gom đặc sản. Mở bán ở Cô Ba từ ngày 75.'); return; }
        const used = Object.values(yearTwo.bag).reduce((sum, count) => sum + count, 0);
        if (used >= 8) { showToast('Ba lô đã đầy · tối đa 8 đơn vị hàng.'); return; }
        const amount = Math.min(2, 8 - used);
        yearTwo.bag[inter.item] = (yearTwo.bag[inter.item] || 0) + amount;
        showToast(`${inter.icon} Gom ${amount} ${inter.name} · ba lô ${used + amount}/8.`);
    } else if (inter.type === 'BED') {
        triggerSleepSummary(false);
    } else if (inter.type === 'PC') {
        closeAllModals();
        pcModalTab = 'finance';
        showPCModal = true;
        GameAudio?.playModalOpen();
    } else if (inter.type === 'FRIDGE') {
        closeAllModals();
        pcModalTab = 'fridge';
        showPCModal = true;
        GameAudio?.playModalOpen();
    } else if (inter.type === 'SHOP_ENTRY') {
        enterShop(inter.data);
    } else if (inter.type === 'MARKET') {
        if (playerStats.hour >= GAME_CONFIG.TIME.MARKET_CLOSE_HOUR) {
            showToast("🌙 Tiệm Tạp Hóa Cô Ba đóng cửa lúc 18:30! Hãy quay lại vào 5:00 sáng mai nhé.");
            return;
        }
        closeAllModals();
        showMarketModal = true;
    } else if (inter.type === 'SEIZED_CART') {
        redeemSeizedCoffeeCart();
    } else if (inter.type === 'BREW_SPOT') {
        if (inter.data?.spotId === 'cart_mobile' && coffeeCart.seized) {
            redeemSeizedCoffeeCart();
            return;
        }
        if (inter.data?.spotId === 'cart_mobile' && !coffeeCart.isOpen) {
            GameAudio?.playError();
            showToast("🔒 Xe Cà Phê đang đóng cửa! Nhấn [C] để mở bán lại.");
            return;
        }
        closeAllModals();
        activeBrewSpot = inter.data;
        showBrewModal = true;
    } else if (inter.type === 'BICYCLE') {
        if (ridingBicycle) {
            ridingBicycle = false;
            showToast("Đã trả xe đạp.");
        } else if (coffeeCart.isPushed) {
            showToast("Đậu xe cà phê trước khi thuê xe đạp.");
        } else if (playerStats.money < bicycleRental.price) {
            showToast("Cần 20.000đ để thuê xe đạp.");
        } else {
            playerStats.money -= bicycleRental.price;
            ridingBicycle = true;
            showToast("Đã thuê xe đạp. Xe tự trả khi rời khu.");
        }
    } else if (inter.type === 'WEDDING') {
        completeWedding();
    } else if (inter.type === 'HOME_EXIT') {
        leaveHome();
    } else if (inter.type === 'FESTIVAL') {
        openFestivalPanel();
    } else if (inter.type === 'FESTIVAL_STALL') {
        openFestivalStall();
    } else if (inter.type === 'CALENDAR') {
        openWallCalendar();
    } else if (inter.type === 'TV') {
        closeAllModals();
        showTVModal = true;
        GameAudio?.playModalOpen();
    } else if (inter.type === 'ALLEY_BOARD') {
        if (!dailyQuest) dailyQuest = rollDailyQuest();
        showToast(
            dailyQuest.completed
                ? `✅ Bảng Tin Hẻm 54: Đã xong nhiệm vụ hôm nay (${dailyQuest.title})! Hẹn sáng mai có tin mới.`
                : `📋 Nhiệm vụ hôm nay: ${dailyQuest.title} (${dailyQuest.progress}/${dailyQuest.target}) · Thưởng ${moneyLabel(dailyQuest.rewardMoney)} & +${dailyQuest.rewardRep} Danh tiếng!`,
            300
        );
    } else if (inter.type === 'DELIVERY_NPC') {
        deliverActiveOrder();
    } else if (inter.type === 'NPC') {
        openNPCDialogue(inter.data);
    }
}

function openNPCDialogue(npc) {
    if (!npc) return;
    closeAllModals();
    activeDialogueNPC = npc;
    activeDialogueNPC.dialogueIndex = 0;
    GameAudio?.playDialogue(true);
    completeTutorialStep(3);
    if (!npc.talkedToday) {
        npc.talkedToday = true;
        recordRelationshipDay(npc);
        npc.friendship = (npc.friendship || 0) + 20;
        checkNPCFriendshipMilestone(npc);
        recordChapterAction('talks');
        recordDailyQuestProgress('talk_npcs');
        addScreenPopup(295, 458, "+20 ❤️ Thân thiết", "#e84393");
    }
}

function giftDrinkToActiveNPC(recipeIdx) {
    const npc = activeDialogueNPC;
    const recipe = GAME_CONFIG.RECIPES[recipeIdx];
    if (!npc || !recipe) return;
    if (!isRecipeUnlocked(recipe.id)) {
        GameAudio?.playClick();
        showToast(getRecipeQuestHint(recipe.id), 300);
        return;
    }
    if (npc.giftedToday) {
        showToast(`💛 Hôm nay bạn đã mời nước ${npc.name} rồi!`);
        return;
    }
    for (const [ing, amt] of Object.entries(recipe.need)) {
        if ((inventory[ing] || 0) < amt) {
            showToast("❌ Không đủ nguyên liệu để pha " + recipe.name + " mời " + npc.name + "!");
            return;
        }
    }
    for (const [ing, amt] of Object.entries(recipe.need)) {
        consumeInventory(ing, amt);
    }
    const isLoved = (npc.lovedDrink === recipe.id);
    const isBirthday = npc.birthday === playerStats.dayOfYear;
    const pts = (isLoved ? 50 : 30) * (isBirthday ? 2 : 1);
    npc.friendship = (npc.friendship || 0) + pts;
    checkNPCFriendshipMilestone(npc);
    npc.giftedToday = true;
    recordRelationshipDay(npc);
    recordDailyQuestProgress('gift_npc');
    recipeQuestStats.npcDrinksGifted += 1;
    addScreenPopup(520, 458, `+${pts} ❤️ (${recipe.name})`, isLoved ? "#e84393" : "#2ecc71");
    showToast(
        isBirthday
            ? `🎂 Quà sinh nhật cho ${npc.name}! (+${pts} điểm thân thiết)`
            : isLoved
            ? `💖 ${npc.name} cực kỳ thích [${recipe.name}]! (+${pts} điểm thân thiết)`
            : `🎁 Đã mời ${npc.name} ly [${recipe.name}] (+${pts} điểm thân thiết)`,
        190
    );
    checkRecipeUnlockQuests();
}

function getNPCDialogues(npc) {
    if (npc.briefingLines && npc.briefingLines.length) {
        return npc.briefingLines;
    }
    const rawBase = (playerConfig.genderIndex === 1 && npc.dialoguesForFemalePlayer)
        ? npc.dialoguesForFemalePlayer
        : (npc.dialogues || ["Chào bạn, chúc một ngày buôn bán đắt khách!"]);
    const lines = [...rawBase];
    const isPlayerBirthday = playerStats.dayOfYear === playerConfig.birthday;
    const fPoints = npc.friendship || 0;
    const relDays = npc.relationshipDays || 0;

    if (spouse === npc) {
        lines.unshift(
            isPlayerBirthday
                ? `🎂 Chúc mừng sinh nhật ${playerConfig.name}! Cảm ơn mình đã luôn cố gắng vì cả hai, tối nay về sớm ăn mừng nhé!`
                : `Chào buổi sáng ${playerConfig.name}! Hôm nay cứ yên tâm bán hàng, việc quán xá có ${npc.name} phụ một tay.`
        );
        lines.push("Từ ngày về chung một nhà, ly cà phê lúc 5 giờ sáng lúc nào cũng thấy ấm áp hơn hẳn.");
        return lines;
    }

    if (engagedNPC === npc) {
        lines.unshift(
            isPlayerBirthday
                ? `🎂 Sinh nhật vui vẻ nhé ${playerConfig.name}! Món quà tuyệt nhất năm nay chắc chắn là đám cưới sắp tới của tụi mình rồi!`
                : (weddingDay !== null
                    ? `Chỉ còn ít hôm nữa là tới ngày cưới (${tailoringPickupDate(weddingDay)}) tại Công Viên rồi, hồi hộp quá đi mất!`
                    : "Mình đã nhận nhẫn rồi đó nha! Khi nào gom đủ 8 triệu thuê rạp cưới thì báo mình biết nhé.")
        );
        return lines;
    }

    if (isPlayerBirthday) {
        lines.unshift(
            fPoints >= 100
                ? `🎂 Chúc mừng sinh nhật bạn thân ${playerConfig.name}! Mong năm nay quán xá phát tài, khách vào nườm nượp nhé!`
                : `🎂 Nghe bà con trong phố bảo hôm nay là sinh nhật ${playerConfig.name}! Chúc bạn tuổi mới thật nhiều sức khỏe và bán đắt hàng!`
        );
    }

    if (canRomance(npc)) {
        if (relDays >= 45) {
            lines.push(`Gắn bó bên nhau đã ${relDays} ngày rồi... Thật lòng ${npc.name} luôn mong có một mái ấm nhỏ cùng ${playerConfig.name}.`);
        } else if (relDays >= 20) {
            lines.push(`Dạo này ngày nào không gặp ${playerConfig.name} nói chuyện là thấy thiếu thiếu làm sao ấy!`);
        } else if (relDays >= 6) {
            lines.push(`Cà phê ${playerConfig.name} pha có bí quyết gì mà càng uống càng thấy nhớ vậy ha?`);
        }
    } else if (fPoints >= 180) {
        lines.push(`Thân với ${playerConfig.name} cỡ này, nếu cần người góp vốn mở mặt bằng lớn hơn thì cứ ới một tiếng nhé!`);
    } else if (fPoints >= 100) {
        lines.push(`Quen biết lâu vậy rồi, thấy ${playerConfig.name} chịu khó từ sáng sớm 5 giờ mà ai trong khu cũng nể!`);
    }

    return lines;
}

function advanceDialogue() {
    if (!activeDialogueNPC) return;
    GameAudio?.playDialogue(false);
    if (activeDialogueNPC.dialogueIndex < getNPCDialogues(activeDialogueNPC).length - 1) {
        activeDialogueNPC.dialogueIndex++;
    } else {
        delete activeDialogueNPC.briefingLines;
        activeDialogueNPC = null;
        if (lyingOnHospitalBed) lyingOnHospitalBed = false;
    }
}

function getBusinessOffers() {
    const activePartners = new Set(Object.values(businesses).map((business) => business.partner?.npc.id));
    return [null, ...storyNPCs.flatMap((npc, index) => {
        if (npc === spouse || npc.friendship < 180 || rejectedPartners.has(npc.id) || activePartners.has(npc.id)) return [];
        const baseRisk = [0.01, 0.06, 0.16, 0.02][index % 4];
        const investigated = investigatedPartners.has(npc.id);
        let risk = baseRisk * (npc.friendship >= 450 ? 0.65 : 1);
        if (investigated) risk = Math.max(0.01, risk * 0.35);
        return [{
            npc,
            share: baseRisk >= 0.15 ? 0.55 : baseRisk >= 0.05 ? 0.40 : 0.28,
            risk,
            investigated,
            paperwork: investigated ? 'Đã xác minh giấy tờ' :
                (baseRisk >= 0.15 ? 'Đòi giữ tiền, giấy tờ thiếu' :
                baseRisk >= 0.05 ? 'Cam kết miệng' : 'Có hợp đồng và biên nhận')
        }];
    })];
}

function businessQuote(rental, type, offer) {
    const total = rental.price + type.setup;
    const partnerFund = offer ? Math.round(total * offer.share / 1000) * 1000 : 0;
    const familyFund = Math.min(spouseBusinessFund, total - partnerFund);
    const due = total - partnerFund - familyFund;
    return { total, partnerFund, familyFund, due, deposit: offer ? Math.round(due * 0.35 / 1000) * 1000 : due };
}

function attemptRentProperty(rental) {
    if (!rental || businessDraft) return;
    if (rentedProperties[rental.id]) {
        const shop = shopsByZone[currentZone]?.find((entry) => entry.rental === rental);
        if (shop) enterShop(shop);
        return;
    }
    const required = getRentalReputationRequirement(rental);
    if (cityReputation < required) {
        showToast(`Cần ${required} danh tiếng thành phố để thuê mặt bằng này (hiện có ${cityReputation}).`);
        return;
    }
    businessDraft = { typeIndex: 0, offerIndex: 0, offers: getBusinessOffers(), confirming: false };
}

function completeBusinessRental(rental, type, partner) {
    if (rentedProperties[rental.id] || businesses[rental.id]) return;
    const required = getRentalReputationRequirement(rental);
    if (cityReputation < required) {
        showToast(`Cần ${required} danh tiếng thành phố để mở mặt bằng này.`);
        return;
    }
    const quote = businessQuote(rental, type, partner);
    if (playerStats.money < (partner ? quote.deposit : quote.due)) {
        GameAudio?.playError();
        showToast("Chưa đủ tiền cho phương án này.");
        return;
    }
    GameAudio?.playUnlock();
    playerStats.money -= quote.deposit;
    spouseBusinessFund -= quote.familyFund;
    businesses[rental.id] = { rental, type, partner, quote, zone: currentZone,
        pending: Boolean(partner), opensDay: playerStats.day + 1 };
    if (!partner) {
        rentedProperties[rental.id] = true;
        dailyReport.rentCost += quote.due;
        addCityReputation(2);
        recordChapterAction('rental');
        checkRecipeUnlockQuests();
    }
    closeAllModals();
    showToast(partner ? "Đã cọc. Kiểm tra kết quả hùn vốn vào sáng mai." :
        "Đã mở " + type.name + " tại " + rental.name + ".");
}

function settleBusinesses() {
    const news = [];
    let income = 0;
    const isRentDueDay = playerStats.day > 1 && (playerStats.dayOfYear % 25 === 0);
    const isRentWarnDay = (playerStats.dayOfYear % 25 === 22);
    let upcomingRentTotal = 0;
    let paidRentTotal = 0;

    for (const [id, business] of Object.entries(businesses)) {
        if (business.pending) {
            const { partner, quote } = business;
            if (business.outcome === undefined) business.outcome = Math.random() < partner.risk ? 'lost' : 'signed';
            if (business.outcome === 'lost') {
                spouseBusinessFund += quote.familyFund;
                rejectedPartners.add(partner.npc.id);
                delete businesses[id];
                news.push(`${partner.npc.name} ôm tiền bỏ trốn. Mất cọc ${moneyLabel(quote.deposit)}.`);
                pendingScamReports.push(`⚠️ Tin dữ sáng sớm! ${partner.npc.name} vừa ôm ${moneyLabel(quote.deposit)} tiền cọc mở ${business.type.name} bỏ trốn mất dạng rồi! Lần sau cháu nhớ chọn đối tác có hợp đồng & biên nhận rõ ràng nhé.`);
                continue;
            }
            const balance = quote.due - quote.deposit;
            if (playerStats.money < balance) {
                news.push(`Còn thiếu tiền để chốt ${business.type.name}: ${moneyLabel(balance - playerStats.money)}.`);
                continue;
            }
            playerStats.money -= balance;
            rentedProperties[id] = true;
            business.pending = false;
            business.opensDay = playerStats.day + 1;
            addCityReputation(2);
            recordChapterAction('rental');
            news.push(`Đã mở ${business.type.name} cùng ${partner.npc.name}.`);
            continue;
        }

        // Tự động thu nợ mặt bằng tồn đọng nếu người chơi đã gom đủ tiền
        if (business.rentOverdue && business.overdueAmount > 0 && playerStats.money >= business.overdueAmount) {
            const paid = business.overdueAmount;
            playerStats.money -= paid;
            dailyReport.rentCost += paid;
            business.rentOverdue = false;
            business.overdueAmount = 0;
            news.push(`Đã tất toán nợ thuê ${business.rental.name} (-${moneyLabel(paid)}), quán mở lại!`);
        }

        // Thu tiền thuê mặt bằng định kỳ mỗi 25 ngày (bỏ qua nếu quán vừa mở chưa đầy 5 ngày)
        const activeDays = playerStats.day - (business.opensDay || 1);
        const rentDue = getBusinessRentDue(business);
        if (isRentWarnDay && activeDays >= 2) {
            upcomingRentTotal += rentDue;
        }
        if (isRentDueDay && activeDays >= 5) {
            if (playerStats.money >= rentDue) {
                playerStats.money -= rentDue;
                dailyReport.rentCost += rentDue;
                paidRentTotal += rentDue;
                creditScore = Math.min(100, creditScore + 1);
            } else {
                business.rentOverdue = true;
                business.overdueAmount = (business.overdueAmount || 0) + rentDue;
                creditScore = Math.max(0, creditScore - 5);
                addCityReputation(-5);
                news.push(`⚠️ Trễ tiền thuê ${business.rental.name} (${moneyLabel(business.overdueAmount)})! Quán tạm đóng & -5 Danh tiếng.`);
            }
        }

        if (business.rentOverdue) continue;

        if (playerStats.day >= business.opensDay && (business.type.daily || business.hasStaff)) {
            const share = business.partner?.share || 0;
            const zone = GAME_CONFIG.ZONES[business.zone];
            const spouseBonus = spouse ? 1.1 : 1;
            let baseDaily = business.type.daily || 0;
            if (business.type.id === 'cafe' && business.hasStaff) {
                baseDaily += 240000;
            }
            const specialtyOptions = {
                florist: [['flowers', 290000, 'hoa Đà Lạt']],
                bakery: [['strawberries', 310000, 'dâu Đà Lạt']],
                cafe: [['coconut', 180000, 'dừa miền Tây'], ['seaSalt', 200000, 'muối biển Vũng Tàu']],
                restaurant: [['seafood', 450000, 'hải sản'], ['oysters', 600000, 'hàu biển Vũng Tàu']],
                fashion: [['silk', 430000, 'lụa miền Tây']],
                lounge: [['strawberries', 250000, 'trái cây Đà Lạt'], ['oysters', 300000, 'hàu biển Vũng Tàu']],
                coworking: [['arabica', 220000, 'Arabica Đà Lạt']]
            }[business.type.id] || [];
            const specialtyUse = specialtyOptions.find(([item]) => yearTwo.stocks[item] > 0);
            if (specialtyUse && yearTwo.stocks[specialtyUse[0]] > 0) {
                baseDaily += specialtyUse[1];
                yearTwo.stocks[specialtyUse[0]] -= 1;
                news.push(`Đặc sản ${specialtyUse[2]} đã hỗ trợ ${business.type.name} (+${moneyLabel(specialtyUse[1])} thu cơ sở).`);
            }
            const repFactor = getBusinessReputationFactor(business.type);
            const staffMult = (business.hasStaff && business.type.id !== 'cafe') ? 1.2 : 1;
            const staffSalary = business.hasStaff ? 120000 : 0;
            const grossShare = Math.round(baseDaily * repFactor * zone.priceMultiplier * (1 - share) * spouseBonus * staffMult / 1000) * 1000;
            const net = grossShare - staffSalary;
            income += Math.max(0, net);
        }
    }
    if (paidRentTotal > 0) {
        news.push(`🏠 Đã đóng tiền mặt bằng định kỳ (25 ngày): -${moneyLabel(paidRentTotal)}.`);
    }
    if (upcomingRentTotal > 0) {
        news.push(`📅 Còn 3 ngày tới kỳ đóng tiền thuê mặt bằng (Tổng: ${moneyLabel(upcomingRentTotal)})!`);
    }
    playerStats.money += income;
    dailyReport.revenue += income;
    totalRevenueEarned += income;
    if (income) news.push("Lãi cửa hàng: +" + moneyLabel(income) + ".");
    businessNews = news;
}

let businessNews = [];
let showBankModal = false;
let showManagementModal = false;
let selectedLoanIndex = 0;
let selectedManagementShop = null;
let dailyPriceIndex = 1;
let dailyRecipeIndex = 0;
let dailyRegularOrders = 0;
let regularContractPaid = false;
let creditScore = 0;
let bankDebt = 0;

let showDeliveryModal = false;
let deliveryOffers = [];
let activeDeliveryOrder = null;
let deliveryCompletedToday = 0;

function hasDeliveryVehicle() {
    return ownedVehicles.size > 0;
}

const DELIVERY_CUSTOMERS = ['Anh Minh', 'Chị Lan', 'Bạn Khoa', 'Cô Thảo', 'Anh Tuấn', 'Bé Vy', 'Chú Hùng'];

function getDeliveryTargetZones() {
    const others = SAIGON_ZONES.filter((k) => k !== currentZone);
    return others.length ? others : SAIGON_ZONES;
}

function generateDeliveryOffers() {
    const targetZones = getDeliveryTargetZones();
    const curHour = Math.floor(playerStats.hour || 5);
    const offers = [];
    const unlockedPool = getUnlockedBaseRecipes();
    for (let i = 0; i < 3; i++) {
        const recipe = unlockedPool[Math.floor(Math.random() * unlockedPool.length)];
        const zoneKey = targetZones[Math.floor(Math.random() * targetZones.length)];
        const zone = GAME_CONFIG.ZONES[zoneKey];
        const zoneRoster = npcRosters[zoneKey]?.length ? npcRosters[zoneKey] : storyNPCs;
        const customerNpc = zoneRoster[Math.floor(Math.random() * zoneRoster.length)];
        const cups = 2 + Math.floor(Math.random() * 3);
        const shipBonus = 18000 + Math.floor(Math.random() * 15000);
        const unitPrice = recipe.baseSellPrice || 24000;
        const reward = Math.round((unitPrice * cups * (zone?.priceMultiplier || 1) + shipBonus) / 1000) * 1000;
        const deadlineHour = curHour + 3 + (i % 2);
        offers.push({
            id: `${playerStats.day}_${curHour}_${i}_${Math.floor(Math.random() * 999)}`,
            recipeIndex: GAME_CONFIG.RECIPES.indexOf(recipe),
            recipeName: recipe.name,
            coffeeNeed: (recipe.need?.coffee || 0) * cups,
            milkNeed: (recipe.need?.milk || 0) * cups,
            fruitNeed: (recipe.need?.fruit || 0) * cups,
            cups,
            zoneKey,
            zoneName: zone ? zone.name : zoneKey,
            reward,
            deadlineHour,
            customerId: customerNpc?.id || null,
            customerName: customerNpc?.name || DELIVERY_CUSTOMERS[i % DELIVERY_CUSTOMERS.length]
        });
    }
    deliveryOffers = offers;
}

function canFulfillDelivery(order) {
    if (!order) return false;
    return inventory.coffee >= order.coffeeNeed &&
        inventory.milk >= order.milkNeed &&
        inventory.fruit >= order.fruitNeed;
}

function acceptDeliveryOffer(index) {
    if (activeDeliveryOrder) {
        GameAudio?.playError();
        showToast("🛵 Bạn đang có 1 đơn cần giao rồi!");
        return;
    }
    const offer = deliveryOffers[index];
    if (!offer) return;
    activeDeliveryOrder = { ...offer };
    deliveryOffers.splice(index, 1);
    showDeliveryModal = false;
    GameAudio?.playClick();
    showToast(`🛵 Nhận đơn: ${offer.cups} ${offer.recipeName} -> ${offer.zoneName} (trước ${formatDeadlineClock(offer.deadlineHour)})`);
}

function deliverActiveOrder() {
    if (!activeDeliveryOrder) return;
    if (currentZone !== activeDeliveryOrder.zoneKey) {
        GameAudio?.playError();
        showToast(`📍 Cần đến ${activeDeliveryOrder.zoneName} để giao đơn này!`);
        return;
    }
    if (!canFulfillDelivery(activeDeliveryOrder)) {
        GameAudio?.playError();
        showToast(`⚠️ Thiếu nguyên liệu để pha ${activeDeliveryOrder.cups} ${activeDeliveryOrder.recipeName}!`);
        return;
    }
    consumeInventory('coffee', activeDeliveryOrder.coffeeNeed);
    consumeInventory('milk', activeDeliveryOrder.milkNeed);
    consumeInventory('fruit', activeDeliveryOrder.fruitNeed);
    const prevRank = getBaristaRank();
    playerStats.money += activeDeliveryOrder.reward;
    dailyReport.cupsSold += activeDeliveryOrder.cups;
    dailyReport.revenue += activeDeliveryOrder.reward;
    totalCupsSold += activeDeliveryOrder.cups;
    totalRevenueEarned += activeDeliveryOrder.reward;
    const newRank = getBaristaRank();
    if (newRank.level > prevRank.level) {
        addCityReputation(3);
        GameAudio?.playUnlock();
        addScreenPopup(500, 180, `🏆 LÊN CẤP BARISTA LV.${newRank.level}: ${newRank.name}!`, "#f0b643");
    }
    deliveryCompletedToday += 1;
    recipeQuestStats.questsOrShipsDone += 1;
    const earnedRepToday = deliveryCompletedToday === 1;
    if (earnedRepToday) addCityReputation(1);
    checkRecipeUnlockQuests();
    GameAudio?.playCoin();
    const targetNpc = storyNPCs.find((n) => n.id === activeDeliveryOrder.customerId);
    if (targetNpc) {
        targetNpc.friendship = (targetNpc.friendship || 0) + 5;
        checkNPCFriendshipMilestone(targetNpc);
        addFloatingText(targetNpc.x + 18, targetNpc.y - 24, `+${moneyLabel(activeDeliveryOrder.reward)} Cảm ơn!`, "#2ecc71");
    }
    const doneZone = activeDeliveryOrder.zoneName;
    const doneName = activeDeliveryOrder.customerName;
    const doneReward = activeDeliveryOrder.reward;
    activeDeliveryOrder = null;
    if (!deliveryOffers.length) generateDeliveryOffers();
    showDeliveryModal = false;
    showToast(`✅ Đã giao đơn cho ${doneName} tại ${doneZone}! +${moneyLabel(doneReward)}${earnedRepToday ? ' (+1 Danh tiếng đơn đầu ngày)' : ''}`);
}

function checkDeliveryExpiration() {
    if (!activeDeliveryOrder) return;
    if (playerStats.hour >= activeDeliveryOrder.deadlineHour) {
        const failedZone = activeDeliveryOrder.zoneName;
        activeDeliveryOrder = null;
        GameAudio?.playError();
        showToast(`⏰ Quá giờ giao đơn đến ${failedZone}! Đơn ship đã bị hủy.`);
    }
}

function drawDeliveryModal() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20,14,10,0.82)");
    drawStandardModalFrame({
        x: 170,
        y: 84,
        w: 660,
        h: 472,
        title: "🛵 NHẬN ĐƠN GIAO HÀNG LIÊN KHU [F]",
        titleSize: 18,
        closeButton: false
    });
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    const curZoneName = GAME_CONFIG.ZONES[currentZone]?.name || currentZone;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(`Vị trí hiện tại: ${curZoneName} · Đã giao hôm nay: ${deliveryCompletedToday} đơn`, 500, 146, 620);

    if (activeDeliveryOrder) {
        const o = activeDeliveryOrder;
        const inTarget = currentZone === o.zoneKey;
        const hasIng = canFulfillDelivery(o);
        pOutlinedRect(ctx, 210, 170, 580, 190, inTarget && hasIng ? "#d6e8c3" : "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.fillText(`ĐƠN ĐANG NHẬN · Khách: ${o.customerName}`, 500, 202);
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.fillText(`${o.cups}x ${o.recipeName}  →  ${o.zoneName}`, 500, 232);
        ctx.font = "13px 'Chakra Petch', sans-serif";
        const repHint = deliveryCompletedToday === 0 ? "(+1 Danh tiếng đơn đầu ngày)" : "(Đã nhận Danh tiếng ship hôm nay)";
        ctx.fillText(`Thưởng: ${moneyLabel(o.reward)} ${repHint} · Hạn chót: ${formatDeadlineClock(o.deadlineHour)}`, 500, 260);
        ctx.fillStyle = hasIng ? "#2f6b2f" : "#a83232";
        ctx.fillText(
            `Nguyên liệu: ☕${o.coffeeNeed}  🥛${o.milkNeed}  🍊${o.fruitNeed} (${hasIng ? 'Đủ nguyên liệu' : 'Thiếu nguyên liệu'})`,
            500,
            286
        );
        pOutlinedRect(ctx, 250, 306, 300, 38, inTarget && hasIng ? "#9ed178" : "#d9cbb3");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText(inTarget ? "✅ Giao đơn ngay" : `📍 Đến ${o.zoneName} để giao`, 400, 330);
        pOutlinedRect(ctx, 570, 306, 180, 38, "#e8a598");
        ctx.fillText("❌ Hủy đơn", 660, 330);
    } else {
        if (!deliveryOffers.length) generateDeliveryOffers();
        deliveryOffers.forEach((offer, idx) => {
            const y = 168 + idx * 96;
            const hasIng = canFulfillDelivery(offer);
            pOutlinedRect(ctx, 210, y, 580, 82, "#fff3d6");
            ctx.fillStyle = PAL.OUTLINE;
            ctx.textAlign = "left";
            ctx.font = "bold 15px 'Chakra Petch', sans-serif";
            ctx.fillText(`${offer.cups}x ${offer.recipeName} → ${offer.zoneName}`, 228, y + 27);
            ctx.font = "13px 'Chakra Petch', sans-serif";
            ctx.fillText(
                `Khách: ${offer.customerName} · Hạn: ${formatDeadlineClock(offer.deadlineHour)} · Cần: ☕${offer.coffeeNeed} 🥛${offer.milkNeed} 🍊${offer.fruitNeed}`,
                228,
                y + 50
            );
            ctx.fillStyle = hasIng ? "#2f6b2f" : "#9c4b2d";
            ctx.fillText(hasIng ? "✓ Đủ nguyên liệu" : "⚠ Cần mua thêm nguyên liệu", 228, y + 70);
            ctx.textAlign = "center";
            pOutlinedRect(ctx, 625, y + 19, 148, 44, "#aaca8c");
            ctx.fillStyle = PAL.OUTLINE;
            ctx.font = "bold 14px 'Chakra Petch', sans-serif";
            ctx.fillText(`Nhận (${moneyLabel(offer.reward)})`, 699, y + 46);
        });
    }

    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    if (!activeDeliveryOrder) {
        pOutlinedRect(ctx, 240, 496, 220, 38, "#d9c29c");
        ctx.fillText("🔄 Đổi đơn mới", 350, 520);
        pOutlinedRect(ctx, 540, 496, 220, 38, "#c84b31");
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Đóng [Q / F]", 650, 520);
    } else {
        pOutlinedRect(ctx, 410, 496, 180, 38, "#c84b31");
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Đóng [Q / F]", 500, 520);
    }
}

function handleDeliveryModalClick(x, y) {
    if (activeDeliveryOrder) {
        if (x >= 410 && x <= 590 && y >= 496 && y <= 534) {
            showDeliveryModal = false;
            GameAudio?.playModalClose();
            return;
        }
        if (x >= 250 && x <= 550 && y >= 306 && y <= 344) {
            deliverActiveOrder();
            return;
        }
        if (x >= 570 && x <= 750 && y >= 306 && y <= 344) {
            activeDeliveryOrder = null;
            GameAudio?.playClick();
            showToast("❌ Đã hủy đơn giao hàng hiện tại.");
            return;
        }
        return;
    }
    if (x >= 240 && x <= 460 && y >= 496 && y <= 534) {
        generateDeliveryOffers();
        GameAudio?.playClick();
        return;
    }
    if (x >= 540 && x <= 760 && y >= 496 && y <= 534) {
        showDeliveryModal = false;
        GameAudio?.playModalClose();
        return;
    }
    for (let idx = 0; idx < deliveryOffers.length; idx++) {
        const cardY = 168 + idx * 96;
        if (x >= 625 && x <= 773 && y >= cardY + 19 && y <= cardY + 63) {
            acceptDeliveryOffer(idx);
            return;
        }
    }
}
let dailyLoanPayment = 0;
let customerReputation = 0;
const loanProducts = [
    { principal: 5000000, fee: 350000, days: 25 },
    { principal: 15000000, fee: 1500000, days: 40 },
    { principal: 40000000, fee: 6000000, days: 60 }
];
const priceOptions = [0.85, 1, 1.15];
const shopUpgrades = [
    { id: 'awning', name: 'Mái che chống mưa', price: 1200000, benefit: 'Khách ít bị ảnh hưởng bởi mưa.' },
    { id: 'machine', name: 'Máy pha nhanh', price: 2500000, benefit: 'Phục vụ nhanh hơn, tiết kiệm thể lực.' },
    { id: 'seating', name: 'Bàn ghế đẹp', price: 1800000, benefit: 'Tăng danh tiếng và khách quen.' }
];

function handleBusinessClick(x, y) {
    const rental = selectedRentalModal;
    const draft = businessDraft;
    const offer = draft.offers[draft.offerIndex];
    if (x >= 715 && x <= 850 && y >= 484 && y <= 523) {
        closeAllModals();
        return;
    }
    if (businesses[rental.id]?.pending) return;
    if (x >= 230 && x <= 770 && y >= 231 && y <= 272) {
        draft.typeIndex = (draft.typeIndex + (x < 500 ? -1 : 1) + businessTypes.length) % businessTypes.length;
        draft.confirming = false;
    } else if (x >= 230 && x <= 770 && y >= 302 && y <= 343) {
        draft.offerIndex = (draft.offerIndex + (x < 500 ? -1 : 1) + draft.offers.length) % draft.offers.length;
        draft.confirming = false;
    } else if (offer && x >= 590 && x <= 770 && y >= 350 && y <= 385) {
        if(!offer.investigated){
            if(playerStats.money<50000){showToast("Cần 50.000đ hỏi thăm và kiểm tra giấy tờ.");return;}
            playerStats.money-=50000;
            offer.investigated=true;
            investigatedPartners.add(offer.npc.id);
            offer.risk=Math.max(0.01,offer.risk*0.35);offer.paperwork="Đã xác minh giấy tờ";
            showToast(`Đã thẩm định ${offer.npc.name}. Rủi ro giảm mạnh.`);
        }
    } else if (x >= 260 && x <= 645 && y >= 484 && y <= 523) {
        if (draft.confirming) completeBusinessRental(rental, businessTypes[draft.typeIndex], draft.offers[draft.offerIndex]);
        else draft.confirming = true;
    }
}

function drawBusinessDraft(rental) {
    const draft = businessDraft;
    const pending = businesses[rental.id]?.pending;
    const type = businessTypes[draft.typeIndex];
    const offer = draft.offers[draft.offerIndex];
    const quote = businessQuote(rental, type, offer);
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20,14,10,0.75)");
    pOutlinedRect(ctx, 150, 111, 700, 421, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 21px 'Chakra Petch', sans-serif";
    ctx.fillText(rental.name, 500, 153, 650);
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`Giá thuê định kỳ (25 ngày): ${moneyLabel(rental.price)} · Danh tiếng hiện có: ${cityReputation}/100`, 500, 181);
    pOutlinedRect(ctx, 715, 484, 120, 39, "#f4d0a5");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText("Đóng [Q]", 775, 509);
    if (pending) {
        ctx.fillText("Đã đặt cọc. Kết quả hoặc số tiền còn thiếu sẽ báo vào sáng hôm sau.", 500, 250, 640);
        return;
    }
    const repPct = Math.round(getBusinessReputationFactor(type) * 100);
    pOutlinedRect(ctx, 230, 231, 540, 41, "#fff3d6");
    pOutlinedRect(ctx, 230, 302, 540, 41, "#fff3d6");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`◀   ${type.name} · Vốn mở ${moneyLabel(type.setup)} · Chuẩn danh tiếng ${type.idealRep}   ▶`, 500, 257, 520);
    ctx.fillStyle = cityReputation < type.idealRep ? "#b85d19" : "#2e7d32";
    ctx.fillText(
        `Công suất khách hiện tại: ${repPct}% (Lãi chuẩn ~${moneyLabel(Math.round(type.daily * getBusinessReputationFactor(type) / 1000) * 1000)}/ngày × Khu)`,
        500, 289, 640
    );
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`◀   ${offer ? offer.npc.name + " · Góp " + Math.round(offer.share * 100) + "%" : "Tự bỏ vốn"}   ▶  (${draft.offerIndex + 1}/${draft.offers.length})`, 500, 328, 510);
    ctx.fillText(offer ? `${offer.paperwork} · Rủi ro mất cọc ${Math.round(offer.risk * 100)}% · Bấm để thẩm định (50.000đ)` :
        "Kết bạn để mở thêm đề nghị hùn vốn.", 500, 365, 640);
    ctx.fillText(`Mày trả ${moneyLabel(quote.due)} · Đối tác ${moneyLabel(quote.partnerFund)} · Gia đình ${moneyLabel(quote.familyFund)}`, 500, 399, 650);
    ctx.fillText(offer ? `Cọc hôm nay ${moneyLabel(quote.deposit)} · Khi ký trả ${moneyLabel(quote.due - quote.deposit)}` :
        "Thanh toán một lần để mở cửa.", 500, 427);
    pOutlinedRect(ctx, 260, 484, 385, 39, draft.confirming ? "#f0b643" : "#aaca8c");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(draft.confirming ? "Xác nhận trả " + moneyLabel(quote.deposit) : "Chọn phương án này", 450, 509);
}

function clearCartCustomers() {
    streetCustomers.forEach((c) => {
        if ((c.state === 'going_to_spot' || c.state === 'waiting_order') && c.targetSpotId === 'cart_mobile') {
            c.state = 'wandering';
            c.targetSpotId = null;
            c.isVipReviewer = false;
            c.orderTimer = 0;
        }
    });
}

function seizeCoffeeCart(silent = false) {
    if (coffeeCart.seized || coffeeCart.isPushed) return;
    coffeeCart.seized = true;
    coffeeCart.isOpen = false;
    coffeeCart.isPushed = false;
    if (showBrewModal && activeBrewSpot?.spotId === 'cart_mobile') showBrewModal = false;
    clearCartCustomers();
    marketInspector.active = true;
    marketInspector.zone = coffeeCart.zone;
    marketInspector.x = Math.min(WORLD_W - 60, coffeeCart.x + 98);
    marketInspector.y = coffeeCart.y + 8;
    marketInspector.dir = -1;
    if (!silent) {
        addCityReputation(-3);
        GameAudio?.playError();
        showToast("👮 Quản Lý Thị Trường đã lập biên bản tạm giữ Xe Cà Phê! Tiền chuộc: 2.000.000đ (-3 Danh tiếng).", 260);
    }
}

function redeemSeizedCoffeeCart() {
    if (!coffeeCart.seized) return;
    if (playerStats.money < CART_BAIL_FEE) {
        GameAudio?.playError();
        showToast("⚠️ Không đủ 2.000.000đ để đóng phạt chuộc lại Xe Cà Phê!");
        return;
    }
    playerStats.money -= CART_BAIL_FEE;
    coffeeCart.seized = false;
    coffeeCart.isOpen = true;
    marketInspector.active = false;
    marketInspector.zone = null;
    marketInspector.patrolCooldown = 2700 + Math.floor(Math.random() * 2700);
    addScreenPopup(110, 56, `-${CART_BAIL_FEE.toLocaleString('vi-VN')}đ`, "#e74c3c");
    addFloatingText(coffeeCart.x + 44, coffeeCart.y - 24, "Đã chuộc xe!", "#2ecc71");
    GameAudio?.playCoin();
    showToast("✅ Đã đóng 2.000.000đ tiền chuộc Xe Cà Phê! Lần sau nhớ né Quản Lý Thị Trường nhé.", 240);
}

function updateMarketInspector() {
    if (coffeeCart.seized) {
        marketInspector.active = true;
        marketInspector.zone = coffeeCart.zone;
        return;
    }
    if (isTutorialActive() || coffeeCart.isPushed || !coffeeCart.isOpen || coffeeCart.zone !== currentZone || (currentZone === 'PARK' && getTodayFestival())) {
        if (marketInspector.active) {
            marketInspector.active = false;
            marketInspector.zone = null;
            marketInspector.patrolCooldown = 2400 + Math.floor(Math.random() * 2400);
        }
        return;
    }
    if (!marketInspector.active) {
        marketInspector.patrolCooldown -= dt;
        if (marketInspector.patrolCooldown <= 0) {
            const fromLeft = coffeeCart.x > WORLD_W / 2;
            marketInspector.active = true;
            marketInspector.zone = currentZone;
            marketInspector.x = fromLeft ? Math.max(40, coffeeCart.x - 420) : Math.min(WORLD_W - 70, coffeeCart.x + 420);
            marketInspector.y = coffeeCart.y + 8;
            marketInspector.dir = fromLeft ? 1 : -1;
        }
        return;
    }
    const targetX = coffeeCart.x + 90;
    const targetY = coffeeCart.y + 8;
    const dx = targetX - marketInspector.x;
    const dy = targetY - marketInspector.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 22) {
        seizeCoffeeCart(false);
        return;
    }
    const step = 1.05 * dt;
    marketInspector.x += (dx / dist) * step;
    marketInspector.y += (dy / dist) * step;
    marketInspector.dir = dx >= 0 ? 1 : -1;
    marketInspector.animTimer += dt;
    if (marketInspector.animTimer >= 16) {
        marketInspector.animFrame = (marketInspector.animFrame + 1) % 4;
        marketInspector.animTimer = 0;
    }
}

function toggleCoffeeCartOpen() {
    if (coffeeCart.seized) {
        redeemSeizedCoffeeCart();
        return;
    }
    if (coffeeCart.isPushed) {
        GameAudio?.playError();
        showToast("Hãy nhấn [G] đậu Xe Cà Phê xuống trước rồi mới đóng/mở bán.");
        return;
    }
    if (coffeeCart.zone === currentZone) {
        const cx = coffeeCart.x + 44;
        const cy = coffeeCart.y + 32;
        if (Math.hypot((player.x + 18) - cx, (player.y + 24) - cy) < 105) {
            coffeeCart.isOpen = !coffeeCart.isOpen;
            GameAudio?.playCartToggle();
            if (!coffeeCart.isOpen) {
                if (showBrewModal && activeBrewSpot?.spotId === 'cart_mobile') showBrewModal = false;
                clearCartCustomers();
                showToast("🔒 Đã đóng cửa Xe Cà Phê 5AM! Khách sẽ không gọi món nữa (nhấn [C] để mở lại).", 200);
            } else {
                spotOrderCooldown = Math.min(spotOrderCooldown, 180);
                showToast("☕ Đã mở cửa Xe Cà Phê 5AM! Sẵn sàng đón khách.", 180);
            }
            return;
        }
    }
    showToast("💡 Lại gần Xe Cà Phê của bạn rồi nhấn [C] để đóng/mở cửa bán hàng!");
}

function togglePushCoffeeCart() {
    if (coffeeCart.seized) {
        redeemSeizedCoffeeCart();
        return;
    }
    if (activeVehicle) {
        GameAudio?.playError();
        showToast("Nhấn [V] và chọn Đi bộ trước khi đẩy xe cà phê.");
        return;
    }
    if (ridingBicycle) {
        GameAudio?.playError();
        showToast("Trả xe đạp trước khi đẩy xe cà phê.");
        return;
    }
    if (coffeeCart.isPushed) {
        GameAudio?.playCartToggle();
        coffeeCart.isPushed = false;
        coffeeCart.zone = currentZone;
        coffeeCart.x = Math.max(40, Math.min(WORLD_W - 130, player.x - 26));
        coffeeCart.y = Math.max(80, Math.min(WORLD_H - 120, player.y - 12));
        spotOrderCooldown = 180; // Đậu xe xong khoảng 3 giây có khách lại xem
        if (currentZone === 'PARK') {
            showToast("🌳 Đã đậu Xe Cà Phê tại Công Viên! Khách dạo công viên rất đông (nhanh gấp đôi!).", 200);
        } else {
            showToast("🅿️ Đã đậu Xe Cà Phê! Nhấn [E] gần xe để mở Menu bán hàng hoặc [G] để đẩy tiếp.", 180);
        }
        return;
    }

    if (coffeeCart.zone === currentZone) {
        const cx = coffeeCart.x + 44;
        const cy = coffeeCart.y + 32;
        if (Math.hypot((player.x + 18) - cx, (player.y + 24) - cy) < 105) {
            coffeeCart.isPushed = true;
            clearCartCustomers();
            GameAudio?.playCartToggle();
            showToast("🛒 Đang đẩy Xe Cà Phê 5AM! Đi sang Công Viên hoặc khu khác rồi nhấn [G] để đậu xe.", 200);
            return;
        }
    }
    showToast("💡 Lại gần Xe Cà Phê của bạn rồi nhấn [G] để đẩy xe đi khu khác!");
}

function switchZone(targetZone, newX, newY, newDir, fromHome = false) {
    if (targetZone === 'PARK') activeVehicle = null;
    if (targetZone !== 'BREEZE_AREA') ridingBicycle = false;
    if (targetZone === 'PARK' && newDir === 'right') newY = 580;
    currentZone = targetZone;
    GameAudio?.playZoneSwitch();
    player.x = newX;
    player.y = newY;
    if (newDir) player.dir = newDir;
    let seizedOnReturn = false;
    if (coffeeCart.isPushed) {
        coffeeCart.zone = targetZone;
    } else if (!fromHome && !isTutorialActive() && !coffeeCart.seized && coffeeCart.zone === targetZone && coffeeCart.isOpen && (targetZone !== 'HOME_STREET' || playerStats.hour >= 8)) {
        const seizeChance = targetZone !== 'HOME_STREET' ? 0.25 : 0.08;
        if (Math.random() < seizeChance) {
            seizeCoffeeCart(false);
            seizedOnReturn = true;
        }
    }
    closeAllModals();
    updateCamera(true);
    const zInfo = GAME_CONFIG.ZONES[targetZone];
    if (zInfo && !seizedOnReturn) {
        showToast("📍 Đã đến: " + zInfo.name + " (Giá bán đồ uống x" + (zInfo.priceMultiplier || 1) + ")", 160);
    }
    if (targetZone !== 'HOME_STREET') completeTutorialStep(4);
}

// ============================================================================
// SỰ KIỆN CLICK CHUỘT
// ============================================================================

canvas.addEventListener('click', function (event) {
    if (window.GameAudio) GameAudio.unlock();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;
    const mobileTouchUI = document.body.classList.contains('is-mobile');

    if (busScene) return;
    if (showYearSummaryModal) {
        showYearSummaryModal = false;
        yearTwo.showTrailer = true;
        GameAudio?.playUnlock();
        return;
    }
    if (yearTwo.showTrailer) {
        yearTwo.showTrailer = false;
        GameAudio?.playClick();
        return;
    }
    if (showBusRoutes) {
        if (mouseX >= 735 && mouseX <= 780 && mouseY >= 142 && mouseY <= 184) showBusRoutes = false;
        const route = busRoutes.find((_, index) =>
            mouseX >= 240 && mouseX <= 760 && mouseY >= 244 + index * 67 && mouseY <= 297 + index * 67);
        if (route) departByBus(route);
        return;
    }
    if (currentGameState === GAME_STATES.PLAYING_STREET && currentZone === busTerminal.zone && !indoorShop && !isAnyModalOpen()) {
        const x = mouseX + Math.round(camera.x);
        const y = mouseY + Math.round(camera.y);
        if (terminalBuses.some(bus => x >= bus.x && x <= bus.x + bus.w && y >= bus.y && y <= bus.y + bus.h)) {
            triggerInteractable({ type: 'BUS' });
            return;
        }
    }

    if (currentGameState === GAME_STATES.WELCOME) {
        GameAudio?.playClick();
        currentGameState = GAME_STATES.MENU;
        return;
    }
    if (currentGameState === GAME_STATES.MENU) {
        const authOpen = !document.getElementById('authModal')?.hidden;
        if (authOpen) return;
        if (showHandbookModal) {
            handleHandbookModalClick(mouseX, mouseY);
            return;
        }
        if (showDeliveryModal) {
            handleDeliveryModalClick(mouseX, mouseY);
            return;
        }
        if (showSettingsModal) {
            if (mouseX >= 407 && mouseX <= 593 && mouseY >= 431 && mouseY <= 473) {
                showSettingsModal = false;
            } else if (mouseX >= 342 && mouseX <= 658 && mouseY >= 280 && mouseY <= 314) {
                setMasterVolume((Math.max(360, Math.min(640, mouseX)) - 360) / 280);
            } else if (mouseX >= 338 && mouseX <= 484 && mouseY >= 363 && mouseY <= 408) {
                setMasterVolume(masterVolume > 0 ? 0 : 0.7);
            } else if (mouseX >= 516 && mouseX <= 662 && mouseY >= 363 && mouseY <= 408) {
                previewSettingSound();
            }
            return;
        }
        if (mouseX >= 842 && mouseX <= 978 && mouseY >= 22 && mouseY <= 58) {
            showHandbookModal = true;
            GameAudio?.playModalOpen();
        } else if (mouseX >= 556 && mouseX <= 832 && mouseY >= 22 && mouseY <= 58) {
            if (window.GameCloud?.isLoggedIn()) {
                GameCloud.signOut();
                GameAudio?.playClick();
            } else {
                window.openCloudAuthModal?.();
                GameAudio?.playClick();
            }
        } else if (window.GameCloud?.isLoggedIn() && mouseX >= 556 && mouseX <= 978 && mouseY >= 66 && mouseY <= 228) {
            for (let i = 0; i < 3; i++) {
                const sy = 66 + i * 56;
                if (mouseY >= sy && mouseY <= sy + 50) {
                    const sv = GameCloud.slots[i];
                    if (sv && mouseX >= 936 && mouseX <= 972) {
                        GameAudio?.playClick();
                        if (!confirm(`Xoá vĩnh viễn file save Ô ${i + 1} (${sv.playerConfig?.name || 'Chủ Quán'})?`)) return;
                        GameCloud.deleteSlot(i).then((res) => {
                            if (res.ok) GameAudio?.playUnlock();
                            else { GameAudio?.playError(); alert('Lỗi xoá file save: ' + res.error); }
                        });
                        return;
                    }
                    GameCloud.activeSlot = i;
                    if (sv) {
                        needsFirstSaveSlotChoice = false;
                        GameAudio?.playUnlock();
                        applySaveData(sv);
                    } else {
                        needsFirstSaveSlotChoice = true;
                        GameAudio?.playClick();
                        currentGameState = GAME_STATES.CHARACTER_CREATION;
                    }
                    return;
                }
            }
        } else if (mouseX >= 340 && mouseX <= 472 && mouseY >= 82 && mouseY <= 111) {
            showSettingsModal = true;
        } else if (mouseX >= 78 && mouseX <= 450 && mouseY >= 408 && mouseY <= 483) {
            if (!window.GameCloud?.isLoggedIn()) {
                GameAudio?.playError();
                window.openCloudAuthModal?.('Bạn phải đăng nhập / đăng ký để chơi game!');
                return;
            }
            const emptyIdx = GameCloud.slots.findIndex((s) => !s);
            GameCloud.activeSlot = emptyIdx >= 0 ? emptyIdx : 0;
            needsFirstSaveSlotChoice = true;
            GameAudio?.playClick();
            currentGameState = GAME_STATES.CHARACTER_CREATION;
        }
    } else if (currentGameState === GAME_STATES.CHARACTER_CREATION) {
        if (mouseY >= 219 && mouseY <= 251) {
            if (mouseX >= 460 && mouseX <= 492) {
                playerConfig.genderIndex = (playerConfig.genderIndex - 1 + playerConfig.genders.length) % playerConfig.genders.length;
            } else if (mouseX >= 754 && mouseX <= 786) {
                playerConfig.genderIndex = (playerConfig.genderIndex + 1) % playerConfig.genders.length;
            }
        }
        if (mouseY >= 296 && mouseY <= 328) {
            if (mouseX >= 460 && mouseX <= 492) {
                playerConfig.outfitIndex = (playerConfig.outfitIndex - 1 + playerConfig.outfits.length) % playerConfig.outfits.length;
            } else if (mouseX >= 754 && mouseX <= 786) {
                playerConfig.outfitIndex = (playerConfig.outfitIndex + 1) % playerConfig.outfits.length;
            }
        }
        if (mouseY >= 373 && mouseY <= 405) {
            if (mouseX >= 460 && mouseX <= 492) {
                playerConfig.accessoryIndex = (playerConfig.accessoryIndex - 1 + playerConfig.accessories.length) % playerConfig.accessories.length;
            } else if (mouseX >= 754 && mouseX <= 786) {
                playerConfig.accessoryIndex = (playerConfig.accessoryIndex + 1) % playerConfig.accessories.length;
            }
        }
        if (mouseX >= 476 && mouseX <= 752 && mouseY >= 488 && mouseY <= 549) {
            if (!birthdayInput.reportValidity()) return;
            playerConfig.birthday = birthdayInput.valueAsNumber;
            let customName = nameInput.value.trim();
            if (customName !== "") {
                playerConfig.name = customName;
            }
            playerFormFields.style.display = 'none';
            birthdayField.hidden = true;
            currentGameState = GAME_STATES.INTRO;
            introVideo.volume = masterVolume;
            introVideo.muted = masterVolume === 0;
            introVideo.play().catch(() => { introPlaybackFailed = true; });
        }
    } else if (currentGameState === GAME_STATES.INTRO) {
        if (introPlaybackFailed || (mouseX >= 785 && mouseY >= 18 && mouseX <= 980 && mouseY <= 60)) {
            finishIntro();
        }
    } else if (currentGameState === GAME_STATES.PLAYING_HOME || currentGameState === GAME_STATES.PLAYING_STREET) {
        // 1. Nếu đang mở Bảng Tổng Kết Cuối Ngày
        if (showSleepSummaryModal) {
            const chooseSlotOnSleep = needsFirstSaveSlotChoice && window.GameCloud?.isLoggedIn();
            const boxH = chooseSlotOnSleep ? 500 : 440;
            const boxY = chooseSlotOnSleep ? 72 : 95;
            if (!sleepForcedByMidnight && (mouseX < 210 || mouseX > 790 || mouseY < boxY || mouseY > boxY + boxH)) {
                showSleepSummaryModal = false;
                GameAudio?.playModalClose();
                showToast("🛏️ Đã rời khỏi giường, tiếp tục hoạt động!");
                return;
            }
            if (chooseSlotOnSleep) {
                if (mouseY >= 452 && mouseY <= 506) {
                    for (let i = 0; i < 3; i++) {
                        const sx = 248 + i * 172;
                        if (mouseX >= sx && mouseX <= sx + 160) {
                            GameCloud.activeSlot = i;
                            GameAudio?.playClick();
                            return;
                        }
                    }
                }
                if (!sleepForcedByMidnight && mouseX >= 598 && mouseX <= 752 && mouseY >= 518 && mouseY <= 562) {
                    showSleepSummaryModal = false;
                    GameAudio?.playModalClose();
                    showToast("🛏️ Đã rời khỏi giường, tiếp tục hoạt động!");
                    return;
                }
                const confirmMaxX = sleepForcedByMidnight ? 680 : 588;
                const confirmMinX = sleepForcedByMidnight ? 320 : 248;
                if (mouseX >= confirmMinX && mouseX <= confirmMaxX && mouseY >= 518 && mouseY <= 562) {
                    needsFirstSaveSlotChoice = false;
                    confirmStartNextDay();
                }
                return;
            }
            if (!sleepForcedByMidnight && mouseX >= 572 && mouseX <= 750 && mouseY >= 455 && mouseY <= 505) {
                showSleepSummaryModal = false;
                GameAudio?.playModalClose();
                showToast("🛏️ Đã rời khỏi giường, tiếp tục hoạt động!");
                return;
            }
            const confirmMinX = sleepForcedByMidnight ? 350 : 250;
            const confirmMaxX = sleepForcedByMidnight ? 650 : 560;
            if (mouseX >= confirmMinX && mouseX <= confirmMaxX && mouseY >= 455 && mouseY <= 505) {
                confirmStartNextDay();
            }
            return;
        }

        if (showHandbookModal) {
            handleHandbookModalClick(mouseX, mouseY);
            return;
        }
        if (showDeliveryModal) {
            handleDeliveryModalClick(mouseX, mouseY);
            return;
        }
        if (mouseX >= (mobileTouchUI ? 828 : 840) && mouseX <= (mobileTouchUI ? 998 : 988) &&
            mouseY >= (mobileTouchUI ? 36 : 40) && mouseY <= (mobileTouchUI ? 74 : 68)) {
            if (showHandbookModal && handbookTab === 'guide') {
                showHandbookModal = false;
                GameAudio?.playModalClose();
            } else {
                closeAllModals();
                handbookTab = 'guide';
                showHandbookModal = true;
                GameAudio?.playModalOpen();
            }
            return;
        }
        if (!indoorShop?.name.includes("BỆNH VIỆN") && !isAnyModalOpen() &&
            mouseX >= 318 && mouseX <= 832 && mouseY >= (mobileTouchUI ? 36 : 40) && mouseY <= (mobileTouchUI ? 74 : 68)) {
            if (isTutorialActive() && mouseX >= 768 && mouseX <= 830) {
                tutorialSkipped = true;
                GameAudio?.playClick();
                showToast("💡 Đã bỏ qua hướng dẫn tân thủ. Bạn vẫn có thể xem Lộ trình khởi nghiệp tại đây!");
                return;
            }
            const info = getActiveGuideTarget();
            GameAudio?.playClick();
            showToast(`🎯 ${info.title}: ${info.hint}`, 280);
            return;
        }
        if (indoorShop) {
            if (showBankModal) { handleBankClick(mouseX, mouseY); return; }
            if (showManagementModal) { handleManagementClick(mouseX, mouseY); return; }
            if (activeDialogueNPC) handleNPCDialogueClick(mouseX, mouseY);
            else if (showShopMenu) {
                if (mouseX >= 430 && mouseX <= 570 && mouseY >= 451 && mouseY <= 479) closeAllModals();
                else if (mouseX >= 280 && mouseX <= 720 && mouseY >= 218) {
                    const offset = mouseY - 218;
                    const item = indoorShop.menu[Math.floor(offset / 54)];
                    if (item && offset % 54 <= 45) buyShopItem(item);
                }
            } else if (showMarketModal) handleMarketModalClick(mouseX, mouseY);
            else if (showBrewModal) handleBrewModalClick(mouseX, mouseY);
            else if (indoorShop.name.includes("BỆNH VIỆN")) {
                for (let idx = 0; idx < 3; idx++) {
                    const bx = 446 + idx * 124;
                    if (mouseX >= bx && mouseX <= bx + 118 && mouseY >= 40 && mouseY <= 68) {
                        switchHospitalFloor(idx);
                        return;
                    }
                }
                if (mouseX >= 804 && mouseX <= 902 && mouseY >= 176 && mouseY <= 232) {
                    switchHospitalFloor((hospitalFloor + 1) % 3);
                    return;
                }
                if (mouseX >= 431 && mouseX <= 569 && mouseY >= 556 && mouseY <= 588) leaveShop();
                else if (mouseX >= 340 && mouseX <= 660 && mouseY >= 184 && mouseY <= 258) useShopCounter();
                else if (mouseY >= 389 && mouseY <= 452) {
                    const floorVisitors = getShopVisitors(indoorShop);
                    const visitor = floorVisitors.find((npc, index) => Math.abs(mouseX - getShopVisitorX(index, floorVisitors.length)) < 50);
                    if (visitor) openNPCDialogue(visitor);
                }
            } else if (indoorShop.nightlife && indoorShop.name.includes("SKYLINE") && Math.abs(mouseX - 384) < 48 && mouseY >= 200 && mouseY <= 275) {
                const kyDuyen = getShopVisitors(indoorShop).find((npc) => npc.id === 'ky_duyen');
                if (kyDuyen) openNPCDialogue(kyDuyen);
            } else if (mouseY >= 389 && mouseY <= 452) {
                const floorVisitors = indoorShop.nightlife && indoorShop.name.includes("SKYLINE")
                    ? getShopVisitors(indoorShop).filter((npc) => npc.id !== 'ky_duyen')
                    : getShopVisitors(indoorShop);
                const visitor = floorVisitors.find((npc, index) => Math.abs(mouseX - getShopVisitorX(index, floorVisitors.length)) < 50);
                if (visitor) openNPCDialogue(visitor);
            } else if (mouseX >= 431 && mouseX <= 569 && mouseY >= 501 && mouseY <= 533) leaveShop();
            else if (indoorShop.rental && mouseX >= 582 && mouseX <= 734 && mouseY >= 501 && mouseY <= 533) {
                closeAllModals();
                selectedManagementShop = indoorShop.rental;
                showManagementModal = true;
                GameAudio?.playModalOpen();
            }
            else if (mouseX >= (indoorShop.nightlife ? 556 : 334) && mouseX <= (indoorShop.nightlife ? 764 : 666) && mouseY >= 198 && mouseY <= 270) useShopCounter();
            return;
        }

        if (showGarage) {
            handleGarageClick(mouseX, mouseY);
            return;
        }
        if (showFestivalPanel) {
            handleFestivalClick(mouseX, mouseY);
            return;
        }
        if (showWallCalendar) {
            handleWallCalendarClick(mouseX, mouseY);
            return;
        }
        if (showTVModal) {
            showTVModal = false;
            GameAudio?.playModalClose();
            return;
        }
        if (showPCModal) {
            handlePCModalClick(mouseX, mouseY);
            return;
        }
        if (currentGameState === GAME_STATES.PLAYING_HOME && !isAnyModalOpen() &&
            mouseX >= roomPC.x - 6 && mouseX <= roomPC.x + roomPC.w + 6 &&
            mouseY >= roomPC.y - 24 && mouseY <= roomPC.y + roomPC.h + 6) {
            closeAllModals();
            pcModalTab = 'finance';
            showPCModal = true;
            GameAudio?.playModalOpen();
            return;
        }
        if (currentGameState === GAME_STATES.PLAYING_HOME && !isAnyModalOpen() &&
            mouseX >= roomFridge.x - 6 && mouseX <= roomFridge.x + roomFridge.w + 6 &&
            mouseY >= roomFridge.y - 24 && mouseY <= roomFridge.y + roomFridge.h + 6) {
            closeAllModals();
            pcModalTab = 'fridge';
            showPCModal = true;
            GameAudio?.playModalOpen();
            return;
        }
        if (currentGameState === GAME_STATES.PLAYING_HOME && !isAnyModalOpen() &&
            mouseX >= roomTV.x && mouseX <= roomTV.x + roomTV.w &&
            mouseY >= roomTV.y && mouseY <= roomTV.y + roomTV.h) {
            closeAllModals();
            showTVModal = true;
            GameAudio?.playModalOpen();
            return;
        }
        if (currentGameState === GAME_STATES.PLAYING_HOME && !isAnyModalOpen() &&
            mouseX >= homeExit.x && mouseX <= homeExit.x + homeExit.w &&
            mouseY >= homeExit.y && mouseY <= homeExit.y + homeExit.h) {
            leaveHome();
            return;
        }
        if (currentGameState === GAME_STATES.PLAYING_HOME && !isAnyModalOpen() &&
            mouseX >= wallCalendar.x && mouseX <= wallCalendar.x + wallCalendar.w &&
            mouseY >= wallCalendar.y && mouseY <= wallCalendar.y + wallCalendar.h) {
            openWallCalendar();
            return;
        }
        if (showNPCSchedule) {
            handleNPCScheduleClick(mouseX, mouseY);
            return;
        }
        if (mouseX >= (mobileTouchUI ? 0 : 10) && mouseX <= (mobileTouchUI ? 315 : 310) &&
            mouseY >= (mobileTouchUI ? 36 : 40) && mouseY <= (mobileTouchUI ? 74 : 68)) {
            openWallCalendar();
            return;
        }

        // 2. Click nút mở Bản Đồ Sơ Đồ [M] trên thanh HUD
        if (mouseX >= (mobileTouchUI ? 310 : 324) && mouseX <= (mobileTouchUI ? 460 : 450) &&
            mouseY >= (mobileTouchUI ? 0 : 4) && mouseY <= (mobileTouchUI ? 36 : 30)) {
            const nextState = !showMapModal;
            closeAllModals();
            showMapModal = nextState;
            return;
        }

        // 3. Click nút chỉnh tốc độ thời gian (1x / 2x) góc phải trên HUD
        if (mouseX >= (mobileTouchUI ? 700 : 715) && mouseX <= (mobileTouchUI ? 810 : 795) &&
            mouseY >= (mobileTouchUI ? 0 : 4) && mouseY <= (mobileTouchUI ? 36 : 30)) {
            playerStats.timeSpeedMultiplier = (playerStats.timeSpeedMultiplier === 1) ? 2 : 1;
            showToast("⏱️ Tốc độ thời gian: " + playerStats.timeSpeedMultiplier + "x (" +
                (playerStats.timeSpeedMultiplier === 1 ? "9.5 phút/ngày chuẩn Stardew" : "4.75 phút/ngày nhanh") + ")");
            return;
        }

        // 4. Xử lý click trong Sơ đồ Khu Phố
        if (showMapModal) {
            handleMapModalClick(mouseX, mouseY);
            return;
        }

        // 5. Xử lý click trong Tiệm Tạp Hóa Cô Ba
        if (showMarketModal) {
            handleMarketModalClick(mouseX, mouseY);
            return;
        }

        // 6. Xử lý click trong Bảng Pha Chế & Bán Cà Phê
        if (showBrewModal) {
            handleBrewModalClick(mouseX, mouseY);
            return;
        }

        // 6b. Xử lý click trong Hộp Thoại Nhân Vật (bao gồm nút Mời Nước tăng thân thiết)
        if (activeDialogueNPC) {
            handleNPCDialogueClick(mouseX, mouseY);
            return;
        }

        // 7. Xử lý click trong Bảng Chi Tiết Thuê Mặt Bằng
        if (selectedRentalModal) {
            if (businessDraft) {
                handleBusinessClick(mouseX, mouseY);
                return;
            }
            if (mouseX >= 310 && mouseX <= 520 && mouseY >= 415 && mouseY <= 460) {
                attemptRentProperty(selectedRentalModal);
                return;
            }
            if (mouseX >= 540 && mouseX <= 680 && mouseY >= 415 && mouseY <= 460) {
                selectedRentalModal = null;
                return;
            }
            selectedRentalModal = null;
            return;
        }

        // 8. Click trực tiếp vào mặt bằng, Xe Đẩy / Chợ hoặc Nhân Vật trên thế giới 2000x1400
        if (currentGameState === GAME_STATES.PLAYING_STREET) {
            const worldClickX = mouseX + camera.x;
            const worldClickY = mouseY + camera.y;

            if (weddingAvailable() && Math.abs(worldClickX - 1000) <= 130 && Math.abs(worldClickY - 700) <= 34) {
                completeWedding();
                return;
            }
            if (currentZone === 'PARK' && getTodayFestival()) {
                if (Math.abs(worldClickX - festivalPlaza.x) <= 106 && Math.abs(worldClickY - festivalPlaza.y) <= 29) {
                    openFestivalPanel();
                    return;
                }
                if (festivalChoice === 'sell' && playerStats.hour >= 9 && playerStats.hour < 21 &&
                    Math.abs(worldClickX - festivalStall.x) <= 96 && Math.abs(worldClickY - festivalStall.y) <= 32) {
                    openFestivalStall();
                    return;
                }
            }

            for (const npc of storyNPCs) {
                if (npc.meeting?.zone === currentZone && !npc.meeting.shop && Math.hypot(worldClickX - (npc.x + 18), worldClickY - (npc.y + 24)) < 42) {
                    if (activeDeliveryOrder && activeDeliveryOrder.zoneKey === currentZone && activeDeliveryOrder.customerId === npc.id) {
                        deliverActiveOrder();
                    } else {
                        openNPCDialogue(npc);
                    }
                    return;
                }
            }
            for (const cust of streetCustomers) {
                if (Math.hypot(worldClickX - (cust.x + 18), worldClickY - (cust.y + 24)) < 42) {
                    openNPCDialogue(cust);
                    return;
                }
            }
            if (currentZone === 'HOME_STREET' && worldClickX >= alleyBoard.x - 10 && worldClickX <= alleyBoard.x + alleyBoard.w + 10 &&
                worldClickY >= alleyBoard.y - 16 && worldClickY <= alleyBoard.y + alleyBoard.h + 10) {
                triggerInteractable({ type: 'ALLEY_BOARD' });
                return;
            }
            if ((currentZone === 'HOME_STREET' || currentZone === 'BETTER_STREET') && Math.hypot(worldClickX - (vendorNPC.x + 18), worldClickY - (vendorNPC.y + 24)) < 46) {
                openNPCDialogue(vendorNPC);
                return;
            }
            const shop = (shopsByZone[currentZone] || []).find(({ x, y, w, h }) =>
                worldClickX >= x && worldClickX <= x + w && worldClickY >= y && worldClickY <= y + h + 28);
            if (shop) {
                enterShop(shop);
                return;
            }
            // Click vào Xe Đẩy Cà Phê di động (khi đang đậu ở khu phố hiện tại)
            if (coffeeCart.zone === currentZone && !coffeeCart.isPushed) {
                if (worldClickX >= coffeeCart.x - 10 && worldClickX <= coffeeCart.x + 135 && worldClickY >= coffeeCart.y - 45 && worldClickY <= coffeeCart.y + 60) {
                    if (coffeeCart.seized) {
                        redeemSeizedCoffeeCart();
                        return;
                    }
                    if (!coffeeCart.isOpen) {
                        GameAudio?.playError();
                        showToast("🔒 Xe Cà Phê đang đóng cửa! Nhấn [C] để mở bán lại.");
                        return;
                    }
                    activeBrewSpot = { spotId: 'cart_mobile', name: "Xe Đẩy Cà Phê 5AM", zoneId: currentZone };
                    showBrewModal = true;
                    return;
                }
            }

        }
    }
});

// ============================================================================
// CẬP NHẬT DI CHUYỂN, VA CHẠM VẬT LÝ & CAMERA TRƯỢT MƯỢT MÀ
// ============================================================================

function checkWorldCollision(nx, ny, colliders, curX = null, curY = null) {
    if (!colliders || colliders.length === 0) return false;
    // Hitbox ở phần chân nhân vật để tạo cảm giác 2.5D tự nhiên giống Stardew Valley
    const footX = nx + 6;
    const footY = ny + 20;
    const footW = 24;
    const footH = 18;
    const hasCur = curX !== null && curY !== null;
    const curFootX = hasCur ? curX + 6 : footX;
    const curFootY = hasCur ? curY + 20 : footY;
    for (const box of colliders) {
        const hitNext = footX < box.x + box.w && footX + footW > box.x &&
                        footY < box.y + box.h && footY + footH > box.y;
        if (!hitNext) continue;
        if (box.dynamic && hasCur) {
            const hitCur = curFootX < box.x + box.w && curFootX + footW > box.x &&
                           curFootY < box.y + box.h && curFootY + footH > box.y;
            if (hitCur) continue; // Tránh kẹt nếu NPC tự đi đụng vào người chơi đang đứng yên
        }
        return true;
    }
    return false;
}

function updatePlayerMovement(minX, maxX, minY, maxY, colliders = null) {
    if (isAnyModalOpen()) {
        player.isMoving = false;
        return;
    }

    let dx = 0;
    let dy = 0;
    if (keys.w || keys.ArrowUp) dy -= 1;
    if (keys.s || keys.ArrowDown) dy += 1;
    if (keys.a || keys.ArrowLeft) dx -= 1;
    if (keys.d || keys.ArrowRight) dx += 1;

    if (dx !== 0 || dy !== 0) {
        player.isMoving = true;
        if (Math.abs(dx) > Math.abs(dy)) {
            player.dir = dx > 0 ? 'right' : 'left';
        } else {
            player.dir = dy > 0 ? 'down' : 'up';
        }

        const len = Math.hypot(dx, dy);
        const speed = player.speed * (activeVehicle?.speed ?? 1) * (cartServiced && coffeeCart.isPushed ? 1.2 : 1) * (ridingBicycle && currentZone === 'BREEZE_AREA' ? 1.65 : 1);
        const stepX = (dx / len) * speed * dt;
        const stepY = (dy / len) * speed * dt;

        // Tách trục X và Y để trượt dọc mép tường mượt mà
        const nextX = Math.max(minX, Math.min(maxX - player.size, player.x + stepX));
        if (!checkWorldCollision(nextX, player.y, colliders, player.x, player.y)) {
            player.x = nextX;
        }

        const nextY = Math.max(minY, Math.min(maxY - player.size, player.y + stepY));
        if (!checkWorldCollision(player.x, nextY, colliders, player.x, player.y)) {
            player.y = nextY;
        }

        player.animTimer += dt;
        if (player.animTimer >= 11) {
            player.animFrame = (player.animFrame + 1) % 4;
            player.animTimer = 0;
        }
    } else {
        player.isMoving = false;
        player.animFrame = 0;
    }
}

function updateCamera(instant = false) {
    const targetX = Math.max(0, Math.min(WORLD_W - canvas.width, player.x + 18 - canvas.width / 2));
    const targetY = Math.max(0, Math.min(WORLD_H - canvas.height, player.y + 18 - canvas.height / 2));
    if (instant) {
        camera.x = targetX;
        camera.y = targetY;
    } else {
        camera.x += (targetX - camera.x) * 0.14;
        camera.y += (targetY - camera.y) * 0.14;
    }
}

let briefedStarter = false;
let briefedPhase = -1;
let briefedEventDay = 0;
let birthdayCelebratedYear = 0;
let pendingBirthdayBriefing = null;
let pendingScamReports = [];

function grantPlayerBirthdayRewards() {
    if (playerStats.dayOfYear !== playerConfig.birthday || birthdayCelebratedYear === playerStats.year) {
        return null;
    }
    birthdayCelebratedYear = playerStats.year;
    const closeFriends = storyNPCs.filter((n) => (n.friendship || 0) >= 100 && n !== spouse);
    const friendCount = Math.min(5, closeFriends.length);
    const baseGift = 200000;
    const friendGift = friendCount * 100000;
    const spouseGift = spouse ? 500000 : 0;
    const totalGift = baseGift + friendGift + spouseGift;

    playerStats.money += totalGift;
    playerStats.energy = playerStats.maxEnergy;
    addInventory('coffee', 3);
    addInventory('milk', 2);
    addInventory('fruit', 2);
    addCityReputation(spouse ? 2 : 1);
    GameAudio?.playUnlock();

    const senderNames = [
        ...(spouse ? [spouse.name] : []),
        ...closeFriends.slice(0, 3).map((n) => n.name)
    ];
    const senderText = senderNames.length
        ? `${senderNames.join(', ')} cùng bà con Hẻm 54`
        : 'Bà con Hẻm 54 và Tiệm Cô Ba';
    pendingBirthdayBriefing = `🎂 Chúc mừng sinh nhật ${playerConfig.name}! ${senderText} gửi tặng cháu ${moneyLabel(totalGift)} tiền mừng, giỏ nguyên liệu tươi (+3 🫘, +2 🥫, +2 🍊) và bánh kem hồi đầy 100% ⚡ thể lực!`;
    return `🎂 Sinh nhật ${playerConfig.name}! Nhận quà +${moneyLabel(totalGift)} & nguyên liệu tươi`;
}

function triggerStreetBriefingIfNeeded() {
    const chuTu = storyNPCs.find((n) => n.id === 'chu_tu');
    if (!chuTu) return;
    ensureChapterProgress();
    const lines = [];

    // Nếu người chơi chọn sinh nhật đúng Ngày 1 thì vẫn nhận quà ngay khi ra phố
    grantPlayerBirthdayRewards();
    if (pendingBirthdayBriefing) {
        lines.push(pendingBirthdayBriefing);
        pendingBirthdayBriefing = null;
    }

    if (pendingScamReports.length > 0) {
        lines.push(...pendingScamReports);
        pendingScamReports.length = 0;
    }

    if (!briefedStarter) {
        briefedStarter = true;
        lines.push("Chào cháu buổi sáng! Chú là Tư Thành, trưởng khu phố Hẻm 54. Sáng sớm cháu nhớ ghé Tiệm Tạp Hóa Cô Ba trước 08:00 để mua nguyên liệu giá sỉ giảm 20%, rồi nhấn [G] đẩy xe cà phê ra bán nhé!");
    }

    if (briefedPhase !== chapterProgress.phase) {
        briefedPhase = chapterProgress.phase;
        const goal = getCurrentChapterGoal();
        lines.push(`📢 Mục tiêu Chặng ${chapterProgress.phase + 1}/4: ${goal.title}. Hoàn thành để tăng danh tiếng thành phố và mở khóa thuê mặt bằng mới!`);
    }

    if (briefedEventDay !== playerStats.day) {
        const todayFest = getTodayFestival();
        const tomorrowDay = (playerStats.dayOfYear % GAME_CONFIG.TIME.DAYS_PER_YEAR) + 1;
        const tomorrowFest = yearFestivals.find((f) => f.day === tomorrowDay);
        if (engagedNPC && weddingDay !== null && playerStats.day >= weddingDay) {
            briefedEventDay = playerStats.day;
            lines.push(`💍 Tin vui: Hôm nay là ngày cưới của cháu với ${engagedNPC.name} tại Công Viên (09:00–21:00), mau qua ngay kẻo trễ!`);
        } else if (todayFest) {
            briefedEventDay = playerStats.day;
            lines.push(`🎉 Tin lễ hội: Hôm nay Công Viên đang tổ chức [${todayFest.name}] từ 09:00–21:00! Cháu ghé chơi hoặc mở quầy bán cà phê lễ hội nha!`);
        } else if (tomorrowFest) {
            briefedEventDay = playerStats.day;
            lines.push(`📅 Báo trước: Ngày mai tại Công Viên sẽ có [${tomorrowFest.name}], cháu nhớ chuẩn bị nguyên liệu trước nhé!`);
        }
    }

    if (lines.length > 0) {
        chuTu.briefingLines = lines;
        activeDialogueNPC = chuTu;
        activeDialogueNPC.dialogueIndex = 0;
        GameAudio?.playDialogue(true);
    }
}

function leaveHome() {
    currentGameState = GAME_STATES.PLAYING_STREET;
    switchZone('HOME_STREET', 945, 445, 'down', true);
    nearbyInteractable = null;
    GameAudio?.playDoor();
    completeTutorialStep(0);
    triggerStreetBriefingIfNeeded();
}

const homeExit = { x: 438, y: 447, w: 124, h: 22 };

function updateHome() {
    updatePlayerMovement(205, 765, 130, 467);

    nearbyInteractable = null;
    // Kiểm tra đứng gần Giường Ngủ (x=100..210, y=100..240)
    if (Math.hypot(player.x - 252, player.y - 190) < 85) {
        nearbyInteractable = {
            type: 'BED',
            label: "🛏️ Giường Ngủ - Nhấn [E] để Đi Ngủ & Tổng Kết Doanh Thu Ngày " + playerStats.day
        };
    } else if (Math.hypot(player.x - 237, player.y - 319) < 75) {
        nearbyInteractable = {
            type: 'PC',
            label: "💻 Máy Tính - Nhấn [E] mở Sổ Kế Toán & Chuỗi Quán"
        };
    } else if (Math.hypot((player.x + 18) - 746, (player.y + 24) - 196) < 88) {
        const curFridge = FRIDGE_UPGRADES[fridgeLevel] || FRIDGE_UPGRADES[0];
        nearbyInteractable = {
            type: 'FRIDGE',
            label: `❄️ ${curFridge.name} (+${curFridge.bonusDays} ngày tươi) - Nhấn [E] kiểm tra kho & nâng cấp`
        };
    }

    if (Math.hypot(player.x + 18 - 631, player.y + 24 - 178) < 95) {
        nearbyInteractable = { type: 'CALENDAR', label: "Lịch treo tường · Nhấn [E] để xem" };
    } else if (Math.hypot(player.x + 18 - (roomTV.x + 33), player.y + 24 - (roomTV.y + 46)) < 92) {
        nearbyInteractable = { type: 'TV', label: "📺 Tivi Dự Báo Thời Tiết · Nhấn [E] để xem bản tin" };
    }

    // So vị trí chân thay vì góc trên của sprite với ngưỡng cửa.
    const footX = player.x + 18;
    const footY = player.y + player.size;
    if (footX >= homeExit.x && footX <= homeExit.x + homeExit.w && footY >= homeExit.y - 24) {
        nearbyInteractable = { type: 'HOME_EXIT', label: "Cửa ra phố · Nhấn [E] để ra ngoài" };
        if (!isAnyModalOpen() && footY >= homeExit.y && (keys.s || keys.ArrowDown)) {
            leaveHome();
        }
    }
}

function updateShopCustomers(festival = null) {
    // Cập nhật Khách Hàng NPC: Công Viên & Khu Trung Tâm đông khách hơn hẳn Hẻm 54
    const festivalSelling = festival && festivalChoice === 'sell' && playerStats.hour >= 9 && playerStats.hour < 21;
    if (!festivalSelling) clearFestivalOrders();
    if (!festivalSelling && showBrewModal && activeBrewSpot?.spotId === 'festival_stall') {
        showBrewModal = false;
    }
    const activeSpots = [];
    if (festivalSelling) {
        activeSpots.push({ spotId: 'festival_stall', x: festivalStall.x - 45, y: festivalStall.y + 48 });
    }
    if (!festival && coffeeCart.zone === currentZone && !coffeeCart.isPushed && coffeeCart.isOpen && !coffeeCart.seized) {
        activeSpots.push({ spotId: 'cart_mobile', x: coffeeCart.x + 26, y: coffeeCart.y + 52 });
    }
    (GAME_CONFIG.RENTALS[currentZone] || []).forEach((r) => {
        if (rentedProperties[r.id] && !businesses[r.id]?.rentOverdue && (!businesses[r.id] || businesses[r.id].type.id === 'cafe') && playerStats.hour < 22) {
            activeSpots.push({ spotId: r.id, x: r.doorX - 18, y: r.doorY + 10 });
        }
    });

    const isBusyZone = (currentZone === 'PARK' || currentZone === 'DOWNTOWN' || currentZone === 'DISTRICT_1' || currentZone === 'BREEZE_AREA');
    const reputationQueue=Math.floor(customerReputation/35);
    const hasCartMobile = activeSpots.some((s) => s.spotId === 'cart_mobile');
    const cartSeatBonus = (hasCartMobile && coffeeCart.seating) ? 1 : 0;
    const maxQueue = festivalSelling ? 3 : Math.min(3,(currentZone === 'PARK' ? 2 : 1)+reputationQueue+cartSeatBonus);
    const baseCooldown = festivalSelling ? 180 : (currentZone === 'PARK') ? 540 : (isBusyZone ? 680 : 1140);
    const hasIndoorShop = activeSpots.some((s) => s.spotId !== 'cart_mobile' && s.spotId !== 'festival_stall');
    const wInfo = getWeatherInfo();
    let weatherMult = hasIndoorShop ? wInfo.indoorShopCooldownMult : wInfo.outdoorCartCooldownMult;
    if (!hasIndoorShop && hasCartMobile && coffeeCart.umbrella && weatherMult > 1) {
        weatherMult = 1 + (weatherMult - 1) * 0.4;
    }
    if (vipRushTimer > 0) vipRushTimer = Math.max(0, vipRushTimer - dt);
    const upgradeBonus=activeSpots.some(s=>businesses[s.spotId]?.upgrades?.awning)?0.75:1;
    const cartSeatSpawnMult = (hasCartMobile && coffeeCart.seating) ? 0.88 : 1;
    const eventSpawnMult = getDailyEventSpawnMult(currentZone);
    const vipRushMult = vipRushTimer > 0 ? 0.6 : 1;
    const zoneCooldown = Math.round(baseCooldown * weatherMult * upgradeBonus * cartSeatSpawnMult * eventSpawnMult * vipRushMult * (1-Math.min(0.2,customerReputation/500)));

    const activeCount = streetCustomers.filter((c) => c.state === 'going_to_spot' || c.state === 'waiting_order').length;
    if (activeSpots.length > 0 && activeCount < maxQueue) {
        if (spotOrderCooldown > 0) {
            spotOrderCooldown -= dt;
        } else {
            const wanderingList = streetCustomers.filter((c) => c.state === 'wandering');
            if (wanderingList.length > 0) {
                const chosen = wanderingList[Math.floor(Math.random() * wanderingList.length)];
                const spot = activeSpots[Math.floor(Math.random() * activeSpots.length)];
                chosen.state = 'going_to_spot';
                chosen.targetSpotId = spot.spotId;
                chosen.targetX = spot.x + activeCount * 36;
                chosen.targetY = spot.y;
                chosen.isRegularOrder = customerReputation >= 12 && Math.random() < Math.min(0.55, 0.15 + customerReputation / 250);
                chosen.isVipReviewer = !vipSpawnedToday && (dailyReport.cupsSold >= 1 || playerStats.hour >= 8) && Math.random() < 0.22;
                if (chosen.isVipReviewer) vipSpawnedToday = true;
                const availRecipes = getAvailableRecipes();
                const unlockedBase = getUnlockedBaseRecipes();
                const focusIdx = Math.min(availRecipes.length - 1, dailyRecipeIndex % unlockedBase.length);
                const prefIdx = availRecipes.findIndex((r) => r.id === wInfo.preferredDrink);
                chosen.wantedRecipeIdx = chosen.isRegularOrder && Math.random() < 0.7
                    ? focusIdx
                    : (prefIdx >= 0 && Math.random() < 0.4 ? prefIdx : Math.floor(Math.random() * availRecipes.length));
                spotOrderCooldown = zoneCooldown;
            }
        }
    }

    streetCustomers.forEach((cust) => {
        if (cust.state === 'wandering') {
            cust.x += cust.speed * cust.dir * dt;
            if (cust.x > 1680) cust.dir = -1;
            if (cust.x < 320) cust.dir = 1;
        } else if (cust.state === 'going_to_spot') {
            if (!activeSpots.some((spot) => spot.spotId === cust.targetSpotId)) {
                cust.state = 'wandering';
                cust.targetSpotId = null;
                cust.isVipReviewer = false;
                return;
            }
            const dx = cust.targetX - cust.x;
            const dy = cust.targetY - cust.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 4) {
                cust.x = cust.targetX;
                cust.y = cust.targetY;
                cust.state = 'waiting_order';
                GameAudio?.playCustomerBell();
                if (cust.isVipReviewer) {
                    showToast("⭐ Food Reviewer VIP vừa ghé quầy! Pha đúng món để nhận thưởng +80% & kích hoạt Giờ Cao Điểm!", 240);
                }
            } else {
                cust.dir = dx >= 0 ? 1 : -1;
                cust.x += (dx / dist) * cust.speed * dt;
                cust.y += (dy / dist) * cust.speed * dt;
            }
        } else if (cust.state === 'waiting_order') {
            if (!activeSpots.some((s) => s.spotId === cust.targetSpotId)) {
                cust.state = 'wandering';
                cust.targetSpotId = null;
                cust.isVipReviewer = false;
            }
        } else if (cust.state === 'leaving') {
            cust.x += cust.speed * cust.dir * dt;
            cust.orderTimer += dt;
            if (cust.orderTimer > 150) {
                cust.state = 'wandering';
                cust.orderTimer = 0;
            }
        }

        if (cust.state !== 'waiting_order') {
            cust.animTimer += dt;
            if (cust.animTimer >= 16) {
                cust.animFrame = (cust.animFrame + 1) % 4;
                cust.animTimer = 0;
            }
        } else {
            cust.animFrame = 0;
        }
    });
    return festivalSelling;
}

function updateStreet() {
    const zoneCfg = GAME_CONFIG.ZONES[currentZone];
    const conn = zoneCfg ? zoneCfg.connections : {};
    const colliders = [...(zoneColliders[currentZone] || [])];
    if (currentZone === busTerminal.zone) {
        for (const bus of terminalBuses) {
            colliders.push({ x: bus.x, y: bus.y + 14, w: bus.w, h: bus.h - 14, dynamic: true });
        }
    }
    if (coffeeCart.zone === currentZone && !coffeeCart.isPushed) {
        colliders.push({ x: coffeeCart.x + 4, y: coffeeCart.y + 8, w: 80, h: 40, dynamic: true });
    }
    storyNPCs.forEach((npc) => {
        if (npc.meeting?.zone === currentZone && !npc.meeting.shop) {
            colliders.push({ x: npc.x + 6, y: npc.y + 18, w: 24, h: 18, dynamic: true });
        }
    });
    streetCustomers.forEach((cust) => {
        colliders.push({ x: cust.x + 6, y: cust.y + 18, w: 24, h: 18, dynamic: true });
    });
    if (currentZone === 'HOME_STREET' || currentZone === 'BETTER_STREET') {
        colliders.push({ x: vendorNPC.x + 6, y: vendorNPC.y + 18, w: 24, h: 18, dynamic: true });
    }

    updatePlayerMovement(16, WORLD_W - 16, 40, WORLD_H - 40, colliders);
    updateCamera(false);

    // Cập nhật xe máy chạy trên trục đường ngang 2000px
    streetMotorbikes.forEach((b) => {
        b.x += b.speed * dt;
        if (b.dir > 0 && b.x > WORLD_W + 80) b.x = -80;
        if (b.dir < 0 && b.x < -80) b.x = WORLD_W + 80;
    });

    // Cập nhật người đạp xe ở Khu Đón Gió
    breezeCyclists.forEach((cy) => {
        cy.x += cy.speed * dt;
        if (cy.dir > 0 && cy.x > WORLD_W + 80) cy.x = -80;
        if (cy.dir < 0 && cy.x < -80) cy.x = WORLD_W + 80;
    });

    // Cập nhật Cô Gánh Hàng Rong
    vendorNPC.x += vendorNPC.speed * vendorNPC.dir * dt;
    if (vendorNPC.x > 1350) vendorNPC.dir = -1;
    if (vendorNPC.x < 550) vendorNPC.dir = 1;
    vendorNPC.animTimer += dt;
    if (vendorNPC.animTimer >= 20) {
        vendorNPC.animFrame = (vendorNPC.animFrame + 1) % 4;
        vendorNPC.animTimer = 0;
    }

    // Nếu đang đẩy Xe Cà Phê thì xe đi theo sát nhân vật
    if (coffeeCart.isPushed) {
        coffeeCart.zone = currentZone;
        const offsetX = player.dir === 'left' ? -56 : (player.dir === 'right' ? 28 : -24);
        const offsetY = player.dir === 'up' ? -24 : 12;
        coffeeCart.x = player.x + offsetX;
        coffeeCart.y = player.y + offsetY;
    }

    const festival = currentZone === 'PARK' ? getTodayFestival() : null;
    const festivalSelling = updateShopCustomers(festival);
    updateMarketInspector();

    // Cập nhật NPC có tên trong khu vực hiện tại
    for (const homeZone of npcScheduleZones) {
        npcRosters[homeZone].forEach((npc, index) => {
            const schedule = getNPCSchedule(homeZone, index);
            const isDeliveryCustomer = activeDeliveryOrder && activeDeliveryOrder.customerId === npc.id;
            const meeting = isDeliveryCustomer
                ? { zone: activeDeliveryOrder.zoneKey, spot: npcMeetingSpots[index % npcMeetingSpots.length], shop: null, isDeliverySpot: true }
                : (schedule.find(({ end }) => playerStats.hour < end) ?? schedule.at(-1));
            if (npc.meeting?.spot !== meeting.spot || npc.meeting?.zone !== meeting.zone || Boolean(npc.meeting?.isDeliverySpot) !== Boolean(meeting.isDeliverySpot)) {
                npc.meeting = meeting;
                npc.x = meeting.spot.label === 'Quảng trường'
                    ? meeting.spot.x : meeting.spot.x + index * 130;
                npc.y = meeting.spot.y;
                npc.minX = npc.x - 24;
                npc.maxX = npc.x + 24;
            }
            if (meeting.zone !== currentZone || meeting.shop) return;
            npc.x += npc.speed * npc.dir * dt;
            if (npc.x > npc.maxX) npc.dir = -1;
            if (npc.x < npc.minX) npc.dir = 1;
            npc.animTimer += dt;
            if (npc.animTimer >= 18) {
                npc.animFrame = (npc.animFrame + 1) % 4;
                npc.animTimer = 0;
            }
        });
    }

    // Kiểm tra tương tác: Tiệm Tạp Hóa, Xe Đẩy Cà Phê, Quán Đã Thuê hoặc Mặt Bằng Cho Thuê
    nearbyRental = null;
    nearbyInteractable = null;

    // Kiểm tra đứng gần Xe Đẩy Cà Phê di động (ở bất kỳ khu phố nào)
    if (coffeeCart.isPushed) {
        nearbyInteractable = {
            type: 'PUSH_HINT',
            label: "🛒 Đang đẩy Xe Cà Phê 5AM - Nhấn [G] để đậu xe xuống bán (Công Viên rất đông khách!)"
        };
    } else if (coffeeCart.zone === currentZone && Math.hypot((player.x + 18) - (coffeeCart.x + 44), (player.y + 24) - (coffeeCart.y + 32)) < 110) {
        nearbyInteractable = coffeeCart.seized
            ? {
                type: 'SEIZED_CART',
                label: "👮 Xe bị Quản Lý Thị Trường tạm giữ! Nhấn [E] hoặc Click để chuộc xe (2.000.000đ)"
            }
            : {
                type: 'BREW_SPOT',
                label: coffeeCart.isOpen
                    ? "☕ Xe Đẩy Cà Phê 5AM - [E] Bán hàng  |  [C] Đóng cửa  |  [G] Đẩy xe"
                    : "🔒 Xe Cà Phê (Đã đóng cửa) - [C] Mở bán lại  |  [G] Đẩy xe đi khu khác",
                data: { spotId: 'cart_mobile', name: "Xe Đẩy Cà Phê 5AM", zoneId: currentZone }
            };
    }

    if (currentZone === 'HOME_STREET') {
        // 1. Đứng gần cửa Nhà Mình (x=945, y=425)
        if (Math.hypot((player.x + 18) - 945, (player.y + 24) - 430) < 65 && (keys.w || keys.ArrowUp)) {
            if (coffeeCart.isPushed) {
                showToast("⚠️ Hãy nhấn [G] đậu Xe Cà Phê ngoài sân trước khi vào phòng ngủ nhé!");
            } else {
                activeVehicle = null;
                currentGameState = GAME_STATES.PLAYING_HOME;
                player.x = 484;
                player.y = 412;
                player.dir = 'up';
                GameAudio?.playDoor();
                return;
            }
        }
    }

    const shop = (shopsByZone[currentZone] || []).find(({ x, y, w, h }) =>
        Math.hypot(player.x + 18 - (x + w / 2), player.y + 24 - (y + h + 14)) < 78);
    if (shop) {
        const action = shop.rental && !rentedProperties[shop.rental.id] ? "Xem mặt bằng" :
            shopIsOpen(shop) ? "Vào trong" : "Đang đóng";
        nearbyInteractable = { type: 'SHOP_ENTRY', data: shop,
            label: `${shop.name} · ${shopHoursLabel(shop)} · [E] ${action}` };
    }

    if (ridingBicycle && currentZone === 'BREEZE_AREA' &&
        Math.hypot(player.x + 18 - bicycleRental.x, player.y + 24 - bicycleRental.y) < 82) {
        nearbyInteractable = {
            type: 'BICYCLE', label: ridingBicycle ? "[E] Trả xe đạp" : "[E] Thuê xe đạp · 20.000đ"
        };
    }

    if (festival && Math.hypot(player.x + 18 - festivalPlaza.x, player.y + 24 - festivalPlaza.y) < 95) {
        nearbyInteractable = { type: 'FESTIVAL', label: festival.name + ' · [E] Mở hoạt động' };
    } else if (festivalSelling && Math.hypot(player.x + 18 - festivalStall.x, player.y + 24 - festivalStall.y) < 95) {
        nearbyInteractable = { type: 'FESTIVAL_STALL', label: "Quầy cà phê lễ hội · [E] Phục vụ khách" };
    }

    if (weddingAvailable() && Math.hypot(player.x + 18 - 1000, player.y + 24 - 700) < 100) {
        nearbyInteractable = { type: 'WEDDING', label: `💍 Lễ cưới với ${engagedNPC.name} · [E] Cử hành` };
    }

    if (!nearbyInteractable && currentZone === busTerminal.zone &&
        terminalBuses.some(bus => Math.hypot(player.x + 18 - (bus.x + bus.w / 2), player.y + 24 - (bus.y + bus.h / 2)) < 115)) {
        nearbyInteractable = { type: 'BUS', label: 'Bấm vào xe khách hoặc nhấn [E] để chọn tuyến' };
    }
    if (!nearbyInteractable && currentZone === 'HOME_STREET' && Math.hypot((player.x + 18) - (alleyBoard.x + 19), (player.y + 24) - (alleyBoard.y + 24)) < 68) {
        nearbyInteractable = {
            type: 'ALLEY_BOARD',
            label: dailyQuest?.completed
                ? "✅ Bảng Tin Hẻm 54 - Đã xong nhiệm vụ hôm nay! [E]"
                : `📋 Bảng Tin Hẻm 54: ${dailyQuest.title} (${dailyQuest.progress}/${dailyQuest.target}) [E]`
        };
    }
    if (!nearbyInteractable && currentZone === 'HOME_STREET' && Math.hypot((player.x + 18) - 1090, (player.y + 24) - 1018) < 75 && (playerStats.year >= 2 || playerStats.dayOfYear >= 75) && !yearTwo.backpack) {
        nearbyInteractable = { type: 'BACKPACK', label: '🎒 Ba lô đi tỉnh (Cô Ba) · [E] Mua 250.000đ' };
    }
    if (!nearbyInteractable) {
        const pickup = [
            { zone: 'DALAT_GREENHOUSE', x: 1112, y: 1101, item: 'flowers', name: 'hoa tươi Đà Lạt', icon: '🌷' },
            { zone: 'DALAT_GREENHOUSE', x: 760, y: 1000, item: 'strawberries', name: 'dâu tây Đà Lạt', icon: '🍓' },
            { zone: 'DALAT_GREENHOUSE', x: 1260, y: 1000, item: 'arabica', name: 'Arabica Đà Lạt', icon: '☕' },
            { zone: 'MEKONG_FLOATING', x: 1015, y: 900, item: 'seafood', name: 'hải sản sông', icon: '🦐' },
            { zone: 'MEKONG_FLOATING', x: 760, y: 900, item: 'coconut', name: 'dừa miền Tây', icon: '🥥' },
            { zone: 'MEKONG_CRAFT', x: 1015, y: 900, item: 'silk', name: 'lụa miền Tây', icon: '🧵' },
            { zone: 'VUNGTAU_FISHING', x: 1092, y: 900, item: 'oysters', name: 'hàu biển Vũng Tàu', icon: '🦪' },
            { zone: 'VUNGTAU_FISHING', x: 817, y: 900, item: 'seafood', name: 'hải sản biển', icon: '🦐' },
            { zone: 'VUNGTAU_LIGHTHOUSE', x: 1015, y: 1070, item: 'seaSalt', name: 'muối biển', icon: '🧂' }
        ].find((spot) => spot.zone === currentZone && Math.hypot(player.x - spot.x, player.y - spot.y) < 110);
        if (pickup) nearbyInteractable = { type: 'SPECIALTY', item: pickup.item, name: pickup.name, icon: pickup.icon, label: `${pickup.icon} ${pickup.name} · [E] Gom tối đa 2` };
    }

    // Kiểm tra đứng gần bất kỳ nhân vật nào (NPC có tên, khách đi dạo, cô hàng rong) để mở Hộp thoại
    if (!nearbyInteractable) {
        const talkables = [
            ...storyNPCs.filter((npc) => npc.meeting?.zone === currentZone && !npc.meeting.shop),
            ...streetCustomers,
            ...((currentZone === 'HOME_STREET' || currentZone === 'BETTER_STREET') ? [vendorNPC] : [])
        ];
        for (const npc of talkables) {
            if (Math.hypot((player.x + 18) - (npc.x + 18), (player.y + 24) - (npc.y + 24)) < 70) {
                const isDeliveryTarget = activeDeliveryOrder && activeDeliveryOrder.zoneKey === currentZone && activeDeliveryOrder.customerId === npc.id;
                nearbyInteractable = isDeliveryTarget
                    ? {
                        type: 'DELIVERY_NPC',
                        label: `🛵 Giao ${activeDeliveryOrder.cups}x ${activeDeliveryOrder.recipeName} cho ${npc.name} · Nhấn [E] hoặc Click`,
                        data: npc
                    }
                    : {
                        type: 'NPC',
                        label: `💬 ${npc.name} - Nhấn [E] hoặc Click để trò chuyện`,
                        data: npc
                    };
                break;
            }
        }
    }

    // Chuyển khu vực qua 4 mép bản đồ 2000x1400
    if (player.x <= 24 && (keys.a || keys.ArrowLeft) && conn.left) {
        const entryY = conn.left === 'DALAT_PINE' ? 600 : (currentZone === 'DALAT_PINE' ? 965 : player.y);
        switchZone(conn.left, WORLD_W - 85, entryY, 'left');
        return;
    }
    if (player.x >= WORLD_W - player.size - 24 && (keys.d || keys.ArrowRight) && conn.right) {
        const entryY = conn.right === 'DALAT_PINE' ? 600 : (currentZone === 'DALAT_PINE' ? 965 : player.y);
        switchZone(conn.right, 45, entryY, 'right');
        return;
    }
    if (player.y <= 55 && (keys.w || keys.ArrowUp) && conn.up) {
        switchZone(conn.up, 980, WORLD_H - 110, 'up');
        return;
    }
    if (player.y >= WORLD_H - player.size - 55 && (keys.s || keys.ArrowDown) && conn.down) {
        switchZone(conn.down, 980, 95, 'down');
        return;
    }
}

// ============================================================================
// CÁC HÀM VẼ GIAO DIỆN, ÁNH SÁNG NGÀY/ĐÊM & BẢNG TƯƠNG TÁC
// ============================================================================

function drawPassengerBus(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    pOutlinedRect(ctx, 0, 0, 154, 43, '#e8b954');
    pRect(ctx, 5, 26, 144, 10, '#a54036');
    for (let windowX = 9; windowX <= 118; windowX += 27) {
        pOutlinedRect(ctx, windowX, 6, 23, 18, '#608a99');
    }
    pRect(ctx, 145, 27, 6, 5, '#fff2bb');
    for (const wheelX of [22, 120]) {
        pOutlinedRect(ctx, wheelX, 34, 16, 16, '#35292a');
        pRect(ctx, wheelX + 5, 39, 6, 6, '#aba095');
    }
    ctx.restore();
}

function drawBusRouteMenu() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, 'rgba(20,14,10,0.75)');
    pOutlinedRect(ctx, 216, 140, 568, 332, '#ecd3ab');
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 24px 'Chakra Petch', sans-serif";
    ctx.fillText('Chọn tuyến xe khách', 500, 184);
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText('09:00 đi · 18:00 về · Vé khứ hồi 200.000đ', 500, 218);
    ctx.fillText('✕', 757, 167);
    busRoutes.forEach((route, index) => {
        const y = 244 + index * 67;
        pOutlinedRect(ctx, 240, y, 520, 53, '#f7d794');
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText((index + 1) + ' · ' + route.name, 500, y + 32);
    });
}

function drawBusScene(progress) {
    const offset = Math.round(progress * 1400);
    pRect(ctx, 0, 0, 1000, 650, '#96b4ae');
    pRect(ctx, 0, 320, 1000, 330, '#729168');
    for (let i = 0; i < 10; i++) {
        const x = i * 140 - (offset % 140);
        pRect(ctx, x, 280 - (i % 3) * 20, 104, 90, '#58745b');
        pRect(ctx, x + 44, 342, 16, 55, '#785546');
    }
    pRect(ctx, 0, 408, 1000, 122, '#504b51');
    for (let x = -(offset % 120); x < 1000; x += 120) pRect(ctx, x, 465, 63, 4, '#d7b776');
    drawPassengerBus(-260 + progress * 1280, 375, 1.65);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 32px 'Chakra Petch', sans-serif";
    ctx.fillText(busScene.title, 500, 134);
    ctx.font = "bold 19px 'Chakra Petch', sans-serif";
    ctx.fillText(busScene.schedule, 500, 174);
}

function drawYearSummaryModal() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#1d1a2c');
    grad.addColorStop(0.5, '#3b293b');
    grad.addColorStop(1, '#58383d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 28; i++) {
        const px = (i * 97 + tickCount * (0.2 + (i % 3) * 0.06)) % canvas.width;
        const py = 24 + ((i * 61) % 600);
        pRect(ctx, px, py, i % 3 === 0 ? 4 : 2, 2, 'rgba(255, 224, 150, 0.52)');
    }

    drawStandardModalFrame({
        x: 110,
        y: 40,
        w: 780,
        h: 558,
        title: '🏆 TỔNG KẾT NĂM 1 · 100 NGÀY KHỞI NGHIỆP 5AM',
        titleSize: 19,
        closeButton: false
    });

    const rank = getBaristaRank();
    const rentedCount = Object.keys(rentedProperties).length;
    const closeFriends = storyNPCs.filter((n) => (n.friendship || 0) >= 100).length;
    const score = cityReputation + rentedCount * 18 + Math.min(40, Math.floor(totalCupsSold / 4)) + closeFriends * 4 + (spouse ? 15 : 0);
    const grade = score >= 140 ? ['S', 'HUYỀN THOẠI CÀ PHÊ SÀI GÒN', '#d4a017']
        : score >= 95 ? ['A', 'ÔNG CHỦ CHUỖI QUÁN SÀI GÒN', '#2e7d32']
        : score >= 55 ? ['B', 'CHỦ QUÁN TRIỂN VỌNG', '#2980b9']
        : ['C', 'CHIẾN BINH HẺM 54', '#a04000'];

    // Thẻ Xếp Hạng bên phải
    pOutlinedRect(ctx, 636, 138, 224, 212, '#f5e3be');
    ctx.fillStyle = '#6e4736';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText('XẾP HẠNG NĂM 1', 748, 166);
    ctx.fillStyle = grade[2];
    ctx.font = "bold 88px 'Chakra Petch', sans-serif";
    ctx.fillText(grade[0], 748, 260);
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(grade[1], 748, 296, 206);
    ctx.font = "11.5px 'Chakra Petch', sans-serif";
    ctx.fillStyle = '#6a5147';
    ctx.fillText(`Chủ quán: ${playerConfig.name}`, 748, 326, 206);

    // Bảng chỉ số bên trái
    pOutlinedRect(ctx, 142, 138, 476, 356, '#fffdf6');
    const rows = [
        ['☕ Tổng số ly đã phục vụ', `${totalCupsSold} ly (Barista Lv.${rank.level})`],
        ['💰 Doanh thu tích lũy Năm 1', moneyLabel(totalRevenueEarned)],
        ['💵 Tiền mặt hiện có', moneyLabel(playerStats.money)],
        ['🏅 Danh tiếng TP / Uy tín quán', `${cityReputation}/100  ·  ${customerReputation}/100`],
        ['🏪 Mặt bằng đã mở / Tủ lạnh', `${rentedCount} quán  ·  Tủ Lv.${fridgeLevel}`],
        ['✨ Công thức Signature đã học', `${unlockedSignatures.size}/3 món`],
        ['🤝 Bạn thân (≥100 điểm)', `${closeFriends} cư dân Sài Gòn`],
        ['💍 Chuyện tình cảm', spouse ? `Đã cưới ${spouse.name}` : (engagedNPC ? `Đính hôn ${engagedNPC.name}` : 'Tập trung sự nghiệp')]
    ];
    rows.forEach(([label, val], idx) => {
        const ry = 172 + idx * 40;
        if (idx % 2 === 0) pRect(ctx, 152, ry - 20, 456, 32, 'rgba(236, 211, 171, 0.35)');
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5c4033';
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.fillText(label, 164, ry);
        ctx.textAlign = 'right';
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        ctx.fillText(val, 596, ry, 230);
    });

    // Hộp giới thiệu Năm 2 bên dưới thẻ xếp hạng
    pOutlinedRect(ctx, 636, 366, 224, 128, '#e6f2ef');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1b4965';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText('🚌 SẮP MỞ KHÓA NĂM 2', 748, 394);
    ctx.fillStyle = '#4a3a35';
    ctx.font = "12px 'Chakra Petch', sans-serif";
    ctx.fillText('Bến Xe Liên Tỉnh 5AM tại', 748, 422);
    ctx.fillText('Khu Đón Gió đã chính thức', 748, 442);
    ctx.fillText('mở tuyến Đà Lạt · Miền Tây', 748, 462);
    ctx.fillText('· Vũng Tàu săn đặc sản!', 748, 482);

    const pulse = Math.sin(tickCount * 0.08) * 2;
    pOutlinedRect(ctx, 250, 514 + pulse, 500, 52, '#547d4e');
    ctx.fillStyle = '#fff6e4';
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillText('🚌 BƯỚC SANG NĂM 2 · KHỞI HÀNH [Click / Enter] ▶', 500, 546 + pulse);
}

function drawYearTwoTrailer() {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#25364a');
    sky.addColorStop(0.58, '#a46e64');
    sky.addColorStop(1, '#ead2a6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 9; i++) {
        const x = 40 + i * 118;
        pRect(ctx, x, 345 - (i % 3) * 32, 96, 185 + (i % 3) * 32, '#334c46');
        pRect(ctx, x + 18, 370 - (i % 3) * 32, 10, 12, '#f0b643');
    }
    pOutlinedRect(ctx, 130, 380, 740, 125, '#d5bd92');
    pOutlinedRect(ctx, 160, 340, 680, 56, '#b94d3b');
    ctx.fillStyle = '#fff1ce'; ctx.textAlign = 'center';
    ctx.font = "bold 25px 'Chakra Petch', sans-serif";
    ctx.fillText('BẾN XE LIÊN TỈNH 5AM', 500, 376);
    pOutlinedRect(ctx, 286, 436, 428, 58, '#f0b643');
    ctx.fillStyle = '#30242a'; ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText('NĂM 2 · CHUYẾN ĐÀ LẠT ĐẦU TIÊN', 500, 474);
    ctx.fillStyle = '#fff3d6'; ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillText('09:00 khởi hành · 10:00 tới nơi · 18:00 lên chuyến về', 500, 550);
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText('Nhấn Enter / E để bắt đầu ngày mới', 500, 595);
}

function drawWelcome() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#1e1b2e');
    grad.addColorStop(0.55, '#3b2b3d');
    grad.addColorStop(1, '#5e3d42');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Chấm sáng lấp lánh nhẹ lúc 5 giờ sáng
    for (let i = 0; i < 24; i++) {
        const px = (i * 113 + tickCount * (0.14 + (i % 3) * 0.05)) % canvas.width;
        const py = 36 + ((i * 59) % 560);
        pRect(ctx, px, py, i % 4 === 0 ? 3 : 2, 2, 'rgba(255, 224, 165, 0.42)');
    }

    // Khung thư chào mừng phong cách Pixel Sài Gòn
    pRect(ctx, 138, 94, 736, 468, 'rgba(14, 11, 16, 0.55)');
    pOutlinedRect(ctx, 130, 86, 740, 468, '#e4b965');
    pOutlinedRect(ctx, 140, 96, 720, 448, '#fff4dc');
    pRect(ctx, 154, 110, 692, 52, '#4d3941');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe3aa';
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText('☕ ĐÔI LỜI TỪ CHÚ NĂM • 5AM SÀI GÒN', 500, 144);

    // Nội dung giới thiệu ấm áp
    const paragraphs = [
        'Helllo mọi người, mình là Chú Năm!',
        'Đây là game 5AM được lấy cảm hứng từ Stardew Valley và một góc nhỏ của Sài Gòn.',
        'Trong thế giới này, mọi người có thể vừa giải trí nhẹ nhàng, vừa tự tay khởi nghiệp',
        'từ chính những lựa chọn của bản thân — từ chiếc xe cà phê hẻm lúc 5 giờ sáng,',
        'tự tay pha từng ly cà phê, làm quen với hàng xóm cho tới mở rộng quán ra phố lớn.',
        'Dù bạn chọn buôn bán chăm chỉ hay dạo phố tận hưởng nhịp sống Sài Gòn,',
        'hi vọng mọi người sẽ có một trải nghiệm thật vui vẻ, thư giãn và đáng nhớ!'
    ];

    ctx.fillStyle = '#47332d';
    ctx.font = "bold 17px 'Chakra Petch', sans-serif";
    ctx.fillText(paragraphs[0], 500, 206);

    ctx.font = "16px 'Chakra Petch', sans-serif";
    ctx.fillStyle = '#5a433b';
    for (let i = 1; i < paragraphs.length; i++) {
        ctx.fillText(paragraphs[i], 500, 212 + i * 33);
    }

    pRect(ctx, 250, 456, 500, 2, '#dfc092');

    // Nút tiếp tục vào màn hình Start
    const pulse = Math.sin(tickCount * 0.08) * 2;
    pRect(ctx, 355, 480 + pulse, 296, 48, 'rgba(37, 29, 29, 0.25)');
    pOutlinedRect(ctx, 350, 475 + pulse, 296, 48, '#547d4e');
    ctx.fillStyle = '#fff6e4';
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillText('VÀO GAME [Click / Enter] ▶', 498, 505 + pulse);
}

function drawMenu() {
    const panX = 250 + Math.sin(tickCount * 0.0026) * 110;
    const panY = 155 + Math.cos(tickCount * 0.0021) * 24;
    ctx.drawImage(zoneCanvases.HOME_STREET, Math.round(panX), Math.round(panY), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

    // Sài Gòn trước bình minh: trời xanh tím phía trên, ánh vàng hắt dần từ chân trời.
    const dawn = ctx.createLinearGradient(0, 0, 0, canvas.height);
    dawn.addColorStop(0, 'rgba(24, 28, 54, 0.78)');
    dawn.addColorStop(0.48, 'rgba(70, 52, 67, 0.50)');
    dawn.addColorStop(0.76, 'rgba(206, 111, 67, 0.24)');
    dawn.addColorStop(1, 'rgba(27, 27, 35, 0.38)');
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mặt trời pixel sau mái nhà và những lớp mây ngang.
    const sunGlow = ctx.createRadialGradient(792, 221, 18, 792, 221, 205);
    sunGlow.addColorStop(0, 'rgba(255, 205, 122, 0.34)');
    sunGlow.addColorStop(1, 'rgba(255, 179, 94, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(570, 20, 430, 390);
    pRect(ctx, 700, 190, 184, 42, 'rgba(255, 205, 122, 0.24)');
    pRect(ctx, 720, 176, 138, 14, 'rgba(255, 222, 164, 0.22)');
    pRect(ctx, 652, 252, 90, 12, 'rgba(255, 196, 130, 0.19)');
    for (let i = 0; i < 7; i++) {
        const bx = 590 + ((i * 137 + tickCount * (0.17 + (i % 3) * 0.06)) % 430);
        const by = 105 + ((i * 53) % 205);
        pRect(ctx, bx, by, 8, 2, 'rgba(255, 231, 187, 0.68)');
        pRect(ctx, bx + 4, by - 2, 3, 2, 'rgba(255, 231, 187, 0.68)');
    }

    // Mặt đường, vạch sáng và quầng đèn tạo lớp tiền cảnh.
    const horizon = ctx.createLinearGradient(0, 390, 0, 650);
    horizon.addColorStop(0, 'rgba(238, 177, 113, 0)');
    horizon.addColorStop(1, 'rgba(29, 25, 31, 0.88)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 370, canvas.width, 280);
    pRect(ctx, 0, 504, canvas.width, 146, 'rgba(34, 29, 34, 0.68)');
    pRect(ctx, 0, 502, canvas.width, 7, '#d9b783');
    pRect(ctx, 0, 509, canvas.width, 3, '#6f5446');
    for (let x = -20; x < canvas.width; x += 106) {
        pOutlinedRect(ctx, x, 581, 54, 7, '#c5a45f');
        pRect(ctx, x + 4, 583, 46, 2, '#f3d282');
    }

    // Vệt đèn xe máy chạy xa xa.
    const trafficX = (tickCount * 2.1) % 1120 - 90;
    pRect(ctx, trafficX, 472, 38, 3, 'rgba(255, 197, 116, 0.75)');
    pRect(ctx, trafficX + 42, 472, 22, 2, 'rgba(255, 225, 177, 0.48)');
    pRect(ctx, trafficX - 350, 454, 26, 2, 'rgba(250, 119, 91, 0.58)');

    // Mặt tiền tiệm cà phê lớn ở tiền cảnh, vẽ như phông minh họa riêng cho màn hình mở đầu.
    pRect(ctx, 588, 253, 370, 264, 'rgba(18, 16, 22, 0.45)');
    pOutlinedRect(ctx, 578, 244, 376, 270, '#4d3534');
    pRect(ctx, 588, 254, 356, 250, '#cf9670');
    pRect(ctx, 588, 254, 356, 12, '#f0c07d');
    pRect(ctx, 596, 268, 340, 8, '#a75b4b');
    pOutlinedRect(ctx, 609, 283, 324, 57, '#e8c28c');
    pOutlinedRect(ctx, 617, 291, 308, 41, '#75433a');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe0a1';
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.fillText('CÀ PHÊ HẺM 54', 771, 318);
    drawStripedAwning(ctx, 595, 347, 342, 32, '#57795d', '#f0d5a7');
    pOutlinedRect(ctx, 611, 388, 112, 113, '#523934');
    pOutlinedRect(ctx, 620, 397, 94, 91, '#9fc0af');
    pRect(ctx, 625, 402, 82, 7, '#e7f0ce');
    pRect(ctx, 663, 398, 4, 90, '#f2dbad');
    pRect(ctx, 620, 443, 94, 4, '#f2dbad');
    pOutlinedRect(ctx, 739, 384, 177, 120, '#3f302f');
    pRect(ctx, 750, 395, 155, 97, '#4b3935');
    for (let sx = 758; sx < 900; sx += 13) {
        pRect(ctx, sx, 398, 4, 91, '#2c2729');
        pRect(ctx, sx + 5, 398, 2, 91, 'rgba(255, 224, 170, 0.25)');
    }
    pRect(ctx, 739, 492, 177, 9, '#e8c28c');
    pOutlinedRect(ctx, 765, 426, 88, 62, '#613f35');
    pRect(ctx, 773, 433, 72, 48, '#e1b477');
    pRect(ctx, 782, 441, 54, 5, '#5c3c32');
    pRect(ctx, 786, 446, 2, 28, '#5c3c32');
    pRect(ctx, 820, 446, 2, 28, '#5c3c32');
    pRect(ctx, 600, 502, 342, 6, '#f2d2a0');
    // Hai khung cửa sáng như tiệm sắp mở ca đầu ngày.
    pRect(ctx, 620, 406, 18, 12, 'rgba(255, 247, 212, 0.65)');
    pRect(ctx, 680, 453, 20, 16, 'rgba(255, 247, 212, 0.24)');

    // Khung bìa trò chơi như tấm bảng gỗ tiệm cà phê đầu hẻm.
    pRect(ctx, 43, 54, 474, 548, 'rgba(24, 20, 26, 0.72)');
    pOutlinedRect(ctx, 38, 48, 474, 548, '#dfb768');
    pOutlinedRect(ctx, 46, 56, 458, 532, '#34272b');
    pRect(ctx, 55, 65, 4, 514, '#b85d45');
    pRect(ctx, 494, 65, 3, 514, '#8d6652');

    // Nhãn nhỏ và logo.
    pOutlinedRect(ctx, 78, 82, 206, 29, '#f2d49e');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#533a34';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText('NHẬT KÝ HẺM SÀI GÒN', 181, 102);
    pOutlinedRect(ctx, 340, 82, 132, 29, '#d9ad62');
    ctx.fillStyle = '#493437';
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.fillText('⚙ CÀI ĐẶT', 406, 101);
    ctx.textAlign = 'left';
    ctx.font = "bold 118px 'Chakra Petch', sans-serif";
    ctx.fillStyle = '#3d2829';
    ctx.fillText('5AM', 83, 246);
    ctx.fillStyle = '#f3cf83';
    ctx.fillText('5AM', 77, 235);
    ctx.fillStyle = '#fff0bd';
    ctx.font = "bold 25px 'Chakra Petch', sans-serif";
    ctx.fillText('★', 356, 169);
    ctx.font = "bold 118px 'Chakra Petch', sans-serif";
    pRect(ctx, 83, 251, 284, 4, '#e9b95f');
    pRect(ctx, 83, 260, 176, 2, 'rgba(245, 215, 168, 0.62)');

    ctx.fillStyle = '#fff0d2';
    ctx.font = "bold 24px 'Chakra Petch', sans-serif";
    ctx.fillText('Một ly cà phê,', 82, 307);
    ctx.fillStyle = '#f2c780';
    ctx.fillText('một đời khởi nghiệp.', 82, 338);
    ctx.fillStyle = '#dbc6b2';
    ctx.font = "15px 'Chakra Petch', sans-serif";
    ctx.fillText('Bắt đầu từ con hẻm nhỏ lúc 5 giờ sáng.', 84, 369);

    // Nút bắt đầu lớn, có viền sáng và bóng đổ (khóa nếu chưa đăng nhập Cloud).
    const isMenuLoggedIn = Boolean(window.GameCloud?.isLoggedIn());
    const pulse = isMenuLoggedIn ? Math.sin(tickCount * 0.065) * 2 : 0;
    pRect(ctx, 82, 415 + pulse, 372, 75, 'rgba(12, 10, 14, 0.68)');
    pOutlinedRect(ctx, 78, 408 + pulse, 372, 75, isMenuLoggedIn ? '#f3c76f' : '#9c8675');
    pOutlinedRect(ctx, 85, 415 + pulse, 358, 61, isMenuLoggedIn ? '#557d4e' : '#63534d');
    pRect(ctx, 91, 421 + pulse, 346, 4, isMenuLoggedIn ? '#88b66e' : '#85746c');
    ctx.textAlign = 'center';
    ctx.fillStyle = isMenuLoggedIn ? '#fff6e4' : '#e6d4bf';
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText(isMenuLoggedIn ? 'BẮT ĐẦU HÀNH TRÌNH' : '🔒 BẮT ĐẦU HÀNH TRÌNH', 264, 449 + pulse);
    ctx.fillStyle = isMenuLoggedIn ? '#e2d1b6' : '#ffcf86';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText(
        isMenuLoggedIn ? 'TẠO NHÂN VẬT  ·  CHỌN CUỘC SỐNG CỦA BẠN' : 'BẠN PHẢI ĐĂNG NHẬP / ĐĂNG KÝ ĐỂ CHƠI GAME',
        264, 468 + pulse
    );

    // Thẻ tính năng như nhãn hàng trên quầy.
    const badges = [
        ['01', '10 KHU PHỐ'], ['02', '37 NHÂN VẬT'],
        ['03', 'MỞ QUÁN KINH DOANH'], ['04', 'LỄ HỘI & TÌNH YÊU']
    ];
    badges.forEach(([number, label], index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = 78 + col * 190;
        const y = 510 + row * 37;
        pOutlinedRect(ctx, x, y, 180, 30, '#ead8b8');
        ctx.textAlign = 'left';
        ctx.fillStyle = '#a44b39';
        ctx.font = "bold 11px 'Chakra Petch', sans-serif";
        ctx.fillText(number, x + 9, y + 19);
        ctx.fillStyle = '#4c3932';
        ctx.font = "bold 11px 'Chakra Petch', sans-serif";
        ctx.fillText(label, x + 36, y + 19, 137);
    });

    // Góc phố bên phải: nắng hắt qua tán cây, xe cà phê và cư dân thức sớm.
    drawShadeTree(ctx, 902, 408, 1.05);
    drawParkBench(ctx, 838, 478);
    pOutlinedRect(ctx, 598, 455, 126, 43, '#563a32');
    pOutlinedRect(ctx, 604, 460, 114, 32, '#f2d8aa');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#773f32';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText('CÀ PHÊ HẺM 54', 661, 474);
    ctx.font = "bold 10px 'Chakra Petch', sans-serif";
    ctx.fillText('MỞ CỬA TỪ 05:00', 661, 487);

    const ut = storyNPCs.find((npc) => npc.id === 'be_ut');
    const hung = storyNPCs.find((npc) => npc.id === 'anh_hung');
    if (ut) drawBitmapCharacter(696, 330, { genderIndex: ut.genderIndex, look: ut.look, outfitIndex: 0,
        outfits: [{ color: ut.shirt, shadow: ut.shadow, shorts: ut.shorts }], accessoryIndex: 0,
        accessories: [{ type: ut.accessory }] }, 'right', Math.floor(tickCount / 25) % 4, true, 2.6);
    if (hung) drawBitmapCharacter(790, 358, { genderIndex: hung.genderIndex, look: hung.look, outfitIndex: 0,
        outfits: [{ color: hung.shirt, shadow: hung.shadow, shorts: hung.shorts }], accessoryIndex: 0,
        accessories: [{ type: hung.accessory }] }, 'left', Math.floor(tickCount / 29) % 4, true, 2.1);

    // Chấm sáng bay trong nắng sớm.
    for (let i = 0; i < 17; i++) {
        const px = 560 + ((i * 79 + tickCount * (0.2 + (i % 4) * 0.09)) % 420);
        const py = 294 + ((i * 47) % 164);
        const size = i % 4 === 0 ? 4 : 2;
        pRect(ctx, px, py, size, size, 'rgba(255, 222, 155, 0.62)');
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3e2c8';
    ctx.font = "12px 'Chakra Petch', sans-serif";
    ctx.fillText('PIXEL LIFE SIM  ·  SÀI GÒN LÚC BÌNH MINH', 760, 622);

    // Cuốn sổ nhỏ hướng dẫn thể lệ ở góc trên phải màn hình Start
    pRect(ctx, 845, 25, 136, 36, 'rgba(18, 14, 18, 0.45)');
    pOutlinedRect(ctx, 842, 22, 136, 36, '#f2dfbd');
    pRect(ctx, 846, 26, 12, 28, '#a74e3d');
    pRect(ctx, 860, 27, 14, 26, '#fff6e5');
    pRect(ctx, 863, 32, 8, 2, '#b9936d');
    pRect(ctx, 863, 37, 8, 2, '#b9936d');
    pRect(ctx, 863, 42, 6, 2, '#b9936d');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#493437';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText('SỔ TAY [B]', 882, 44);

    // Thanh Tài khoản Cloud & Tiếp tục chơi ở góc trên phải
    const loggedIn = window.GameCloud?.isLoggedIn();
    pRect(ctx, 559, 25, 276, 36, 'rgba(18, 14, 18, 0.45)');
    pOutlinedRect(ctx, 556, 22, 276, 36, loggedIn ? '#d9ead0' : '#f0b643');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3d2a2b';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText(
        loggedIn ? `👤 ${GameCloud.getUsername()} · ĐĂNG XUẤT` : '👤 ĐĂNG NHẬP / ĐĂNG KÝ',
        694, 44, 260
    );
    if (loggedIn) {
        for (let i = 0; i < 3; i++) {
            const sy = 66 + i * 56;
            const sv = GameCloud.slots[i];
            pRect(ctx, 559, sy + 3, 422, 50, 'rgba(18, 14, 18, 0.45)');
            pOutlinedRect(ctx, 556, sy, 422, 50, sv ? '#fff3d6' : 'rgba(242, 223, 189, 0.85)');
            pRect(ctx, 562, sy + 6, 6, 38, sv ? '#547d4e' : '#a88c72');
            ctx.textAlign = 'left';
            ctx.fillStyle = '#493437';
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            if (sv) {
                const svMoney = (sv.playerStats?.money || 0).toLocaleString('vi-VN');
                ctx.fillText(`Ô ${i + 1}: ${sv.playerConfig?.name || 'Chủ Quán'}`, 576, sy + 21, 250);
                ctx.fillStyle = '#705144';
                ctx.font = "11px 'Chakra Petch', sans-serif";
                ctx.fillText(`Năm ${sv.playerStats?.year || 1} • Ngày ${sv.playerStats?.dayOfYear || 1}/100  |  ${svMoney}đ`, 576, sy + 39, 270);
                pOutlinedRect(ctx, 858, sy + 11, 72, 28, '#547d4e');
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff6e4';
                ctx.font = "bold 11px 'Chakra Petch', sans-serif";
                ctx.fillText('▶ CHƠI', 894, sy + 29);
                pOutlinedRect(ctx, 936, sy + 11, 34, 28, '#c84b31');
                ctx.fillStyle = '#fff6e4';
                ctx.fillText('🗑', 953, sy + 29);
            } else {
                ctx.fillText(`Ô ${i + 1}: (Trống)`, 576, sy + 21);
                ctx.fillStyle = '#705144';
                ctx.font = "11px 'Chakra Petch', sans-serif";
                ctx.fillText('Click để tạo nhân vật mới & lưu vào ô này', 576, sy + 39);
            }
        }
    }

    if (showSettingsModal) drawSettingsModal();
}

function handleHandbookModalClick(mx, my) {
    if (mx >= 270 && mx <= 488 && my >= 36 && my <= 68) {
        handbookTab = 'guide';
        GameAudio?.playClick();
        return;
    }
    if (mx >= 512 && mx <= 730 && my >= 36 && my <= 68) {
        handbookTab = 'schedule';
        scheduleZone = currentGameState === GAME_STATES.PLAYING_HOME ? 'HOME_STREET' : (currentZone || 'HOME_STREET');
        GameAudio?.playClick();
        return;
    }
    if (handbookTab === 'schedule') {
        if (mx < 32 || mx > 968 || my < 70 || my > 580) {
            showHandbookModal = false;
            GameAudio?.playModalClose();
            return;
        }
        handleNPCScheduleClick(mx, my);
        return;
    }
    if ((mx >= 808 && mx <= 872 && my >= 104 && my <= 136) ||
        mx < 100 || mx > 900 || my < 85 || my > 565) {
        showHandbookModal = false;
        GameAudio?.playModalClose();
    }
}

function drawHandbookTabs() {
    pOutlinedRect(ctx, 270, 36, 218, 32, handbookTab === 'guide' ? '#f0b643' : '#fff3d6');
    pOutlinedRect(ctx, 512, 36, 218, 32, handbookTab === 'schedule' ? '#f0b643' : '#fff3d6');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#493437';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText('1. 📖 Sổ tay', 379, 57);
    ctx.fillText('2. 👥 Lịch nhân vật [L]', 621, 57);
}

function drawHandbookModal() {
    if (handbookTab === 'schedule') {
        drawNPCSchedulePanel();
        drawHandbookTabs();
        return;
    }
    pRect(ctx, 0, 0, canvas.width, canvas.height, 'rgba(16, 14, 20, 0.78)');
    drawHandbookTabs();
    // Bìa da cuốn sổ nhỏ
    pRect(ctx, 108, 92, 796, 480, 'rgba(12, 10, 14, 0.45)');
    pOutlinedRect(ctx, 100, 85, 800, 480, '#7c4734');
    pOutlinedRect(ctx, 114, 96, 384, 458, '#fff5df');
    pOutlinedRect(ctx, 502, 96, 384, 458, '#fff5df');
    pRect(ctx, 496, 94, 8, 462, '#9e6c4f'); // Gáy sổ
    pRect(ctx, 148, 86, 18, 28, '#c84b31');  // Dải đánh dấu trang
    drawStandardModalHeader({
        x: 100,
        y: 85,
        w: 800,
        title: '📖 SỔ TAY KHỞI NGHIỆP 5AM',
        titleAlign: 'left',
        titleSize: 17,
        closeButton: false
    });

    // Nút đóng góc phải trên
    pOutlinedRect(ctx, 808, 104, 64, 30, '#c84b31');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText('Đóng [Q]', 840, 123);

    // Trang trái
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b3a2b';
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText('BẮT ĐẦU KINH DOANH', 136, 158);
    pRect(ctx, 136, 165, 336, 2, '#d9b98c');

    const leftLines = [
        { h: '1. Nhịp sống 05:00 - 24:00', t: [
            '• Thức dậy lúc 05:00 sáng (100 ngày/năm).',
            '• Tiệm Tạp Hóa Cô Ba giảm 20% trước 08:00',
            '  và đóng cửa lúc 18:30.',
            '• Về nhà lên giường ngủ trước 24:00 để tổng kết',
            '  doanh thu; thức quá khuya sẽ dậy muộn (08:00).'
        ]},
        { h: '2. Phím điều khiển nhanh', t: [
            '• W A S D / Mũi tên: Di chuyển',
            '• E / Click: Tương tác, pha chế, nói chuyện NPC',
            '• 1 – 6: Chọn nhanh món khi đang mở quầy',
            '• G: Đẩy hoặc đậu Xe Cà Phê 5AM',
            '• M: Sơ đồ khu phố  |  L: Lịch trình NPC',
            '• V: Garage xe  |  H: Bấm còi / Chuông xe',
            '• B: Mở/đóng Sổ tay  |  Q: Đóng bảng / Ra quán'
        ]}
    ];

    let ly = 184;
    leftLines.forEach((sec) => {
        ctx.fillStyle = '#5c382c';
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText(sec.h, 136, ly);
        ly += 22;
        ctx.fillStyle = '#4a3a35';
        ctx.font = "13px 'Chakra Petch', sans-serif";
        sec.t.forEach((line) => {
            ctx.fillText(line, 136, ly, 352);
            ly += 21;
        });
        ly += 14;
    });

    // Trang phải
    ctx.fillStyle = '#8b3a2b';
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText('☕ THỂ LỆ & MẸO KINH DOANH', 524, 158);
    pRect(ctx, 524, 165, 270, 2, '#d9b98c');

    const rightLines = [
        { h: '3. Pha chế & Phục vụ khách', t: [
            '• Đậu xe [G] hoặc vào quán đã thuê, đợi khách tới',
            '  quầy (có tiếng chuông) rồi nhấn [E] pha đúng món.'
        ]},
        { h: '4. Thời tiết, Thể lực & Mặt bằng', t: [
            '• Nắng gắt bán chạy Bạc Xỉu; Mưa/Bão quán có mái',
            '  che ổn định hơn. Ăn Bánh Mì hồi +38 ⚡ hoặc đi ngủ.',
            '• Tăng Danh tiếng (0–100) để thuê mặt bằng lớn hơn.',
            '• Có thể rủ NPC thân thiết góp vốn mở quán (chú ý',
            '  hợp đồng/biên nhận kẻo bị ôm tiền cọc bỏ trốn!).'
        ]},
        { h: '5. Tình yêu & Kết hôn', t: [
            '• Trò chuyện & mời nước NPC hẹn hò mỗi ngày',
            '  (tặng đúng món thích & ngày sinh nhật tăng nhiều ❤️).',
            '• Đủ 10 tim & 60 ngày gắn bó: mua Nhẫn cầu hôn tại',
            '  Tiệm Trang Sức (Trung Tâm), thuê rạp (8.000.000đ)',
            '  và đến Công Viên (09:00–21:00) cử hành lễ cưới.',
            '• Bạn đời sẽ phụ pha chế, giữ danh tiếng & tăng thu!'
        ]}
    ];

    let ry = 180;
    rightLines.forEach((sec) => {
        ctx.fillStyle = '#5c382c';
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        ctx.fillText(sec.h, 524, ry);
        ry += 20;
        ctx.fillStyle = '#4a3a35';
        ctx.font = "12.5px 'Chakra Petch', sans-serif";
        sec.t.forEach((line) => {
            ctx.fillText(line, 524, ry, 352);
            ry += 19;
        });
        ry += 9;
    });
}

function drawSettingsModal() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, 'rgba(16, 15, 23, 0.78)');
    drawStandardModalFrame({
        x: 242,
        y: 145,
        w: 516,
        h: 354,
        title: '⚙️ CÀI ĐẶT',
        titleSize: 20,
        closeButton: false
    });
    ctx.fillStyle = '#674a3b';
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillText('Âm lượng âm thanh', 500, 257);
    pOutlinedRect(ctx, 342, 280, 316, 34, '#fff4dc');
    pRect(ctx, 360, 294, 280, 7, '#9b846a');
    const knobX = 360 + Math.round(masterVolume * 280);
    pRect(ctx, 360, 294, Math.round(masterVolume * 280), 7, '#bf684d');
    pOutlinedRect(ctx, knobX - 9, 286, 18, 23, '#e2ad59');
    ctx.fillStyle = '#684538';
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`${Math.round(masterVolume * 100)}%`, 500, 340);
    pOutlinedRect(ctx, 338, 363, 146, 45, masterVolume === 0 ? '#9a6b5d' : '#d9ead0');
    ctx.fillStyle = '#4a3833';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(masterVolume === 0 ? '🔇 Bật lại tiếng' : '🔊 Tắt tiếng', 411, 390);
    pOutlinedRect(ctx, 516, 363, 146, 45, '#f3d99f');
    ctx.fillText('Thử âm thanh', 589, 390);
    ctx.fillStyle = '#8b7562';
    ctx.font = "11px 'Chakra Petch', sans-serif";
    ctx.fillText('Mức này áp dụng cho nhạc nền, intro và hiệu ứng âm thanh.', 500, 423);
    pOutlinedRect(ctx, 407, 431, 186, 42, '#557d4e');
    ctx.fillStyle = '#fff4dd';
    ctx.font = "bold 15px 'Chakra Petch', sans-serif";
    ctx.fillText('XONG [Q]', 500, 458);
}

function drawCharacterCreation() {
    const backdrop = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    backdrop.addColorStop(0, '#292337');
    backdrop.addColorStop(0.55, '#493544');
    backdrop.addColorStop(1, '#202936');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 24; i++) {
        const px = (i * 127 + tickCount * (0.13 + (i % 3) * 0.04)) % canvas.width;
        const py = 24 + ((i * 61) % 580);
        pRect(ctx, px, py, i % 5 === 0 ? 4 : 2, 2, 'rgba(255, 221, 165, 0.35)');
    }

    pRect(ctx, 85, 25, 830, 565, 'rgba(10, 12, 20, 0.55)');
    pOutlinedRect(ctx, 78, 18, 844, 565, '#e4b965');
    pOutlinedRect(ctx, 86, 26, 828, 549, '#f0d7ad');
    pRect(ctx, 98, 38, 804, 43, '#4d3941');
    ctx.fillStyle = '#f4d489';
    ctx.font = "bold 24px 'Chakra Petch', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('CHỌN NHÂN VẬT CỦA BẠN', 500, 67);

    // Khung avatar như tấm gương trong tiệm may.
    pRect(ctx, 119, 115, 199, 343, 'rgba(30, 25, 31, 0.32)');
    pOutlinedRect(ctx, 112, 108, 199, 343, '#a85d48');
    pOutlinedRect(ctx, 120, 116, 183, 327, '#ead4ad');
    pOutlinedRect(ctx, 134, 130, 155, 273, '#a8bba0');
    pRect(ctx, 140, 137, 143, 166, '#bdcbb0');
    pRect(ctx, 140, 303, 143, 94, '#c8ac83');
    pRect(ctx, 140, 300, 143, 4, '#eee0bd');
    pRect(ctx, 141, 394, 141, 5, '#705448');
    // Ánh sáng cửa sổ và chậu cây nhỏ trong góc thử đồ.
    pOutlinedRect(ctx, 145, 145, 34, 66, '#e8d8b6');
    pOutlinedRect(ctx, 150, 150, 24, 56, '#7fa6a2');
    pRect(ctx, 161, 150, 2, 56, '#e8d8b6');
    pRect(ctx, 150, 177, 24, 2, '#e8d8b6');
    drawTerracottaPlant(ctx, 258, 364, 0.9);
    // Bệ đứng tạo bóng đổ để nhân vật có cảm giác đặt trong không gian.
    ctx.fillStyle = 'rgba(49, 39, 38, 0.22)';
    ctx.beginPath(); ctx.ellipse(216, 386, 52, 12, 0, 0, Math.PI * 2); ctx.fill();
    pOutlinedRect(ctx, 162, 377, 108, 15, '#ad805b');
    drawBitmapCharacter(169, 210, playerConfig, 'down', Math.floor(tickCount / 26) % 4, true, 4.5);
    pOutlinedRect(ctx, 151, 410, 120, 25, '#f5e4c5');
    ctx.fillStyle = '#553f36';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText('XEM TRƯỚC', 211, 427);

    // Bảng thông tin bên phải; input tên/ngày sinh nằm trong hai dòng mở đầu.
    pOutlinedRect(ctx, 344, 98, 533, 100, '#f6e7c7');
    pRect(ctx, 352, 106, 517, 25, '#ead0a4');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#70463d';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText('HỒ SƠ CHỦ QUÁN', 610, 123);

    const rows = [
        { label: 'GIỚI TÍNH', value: playerConfig.genders[playerConfig.genderIndex], y: 231, chip: '#9d7180' },
        { label: 'TRANG PHỤC', value: playerConfig.outfits[playerConfig.outfitIndex].name, y: 308, chip: '#5f8291' },
        { label: 'PHỤ KIỆN', value: playerConfig.accessories[playerConfig.accessoryIndex].name, y: 385, chip: '#a67843' }
    ];
    rows.forEach((row) => {
        pOutlinedRect(ctx, 344, row.y - 26, 533, 61, '#f3e4c4');
        pRect(ctx, 357, row.y - 15, 6, 38, row.chip);
        ctx.fillStyle = '#6a5147';
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.textAlign = 'left';
        ctx.fillText(row.label, 374, row.y - 6);
        pOutlinedRect(ctx, 522, row.y - 17, 226, 39, '#fff8e8');
        ctx.textAlign = 'center';
        ctx.fillStyle = '#994e3d';
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.fillText(row.value, 635, row.y + 7, 208);
    });
    drawArrowButton(476, 235, '‹');
    drawArrowButton(770, 235, '›');
    drawArrowButton(476, 312, '‹');
    drawArrowButton(770, 312, '›');
    drawArrowButton(476, 389, '‹');
    drawArrowButton(770, 389, '›');

    // Nút xác nhận có mép sáng và bóng dập nổi.
    pRect(ctx, 482, 495, 276, 61, 'rgba(37, 29, 29, 0.28)');
    pOutlinedRect(ctx, 476, 488, 276, 61, '#e9bd67');
    pOutlinedRect(ctx, 483, 495, 262, 47, '#547d4e');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff6e4';
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillText('BẮT ĐẦU KHỞI NGHIỆP', 614, 525);
    ctx.fillStyle = '#ead9bd';
    ctx.font = "11px 'Chakra Petch', sans-serif";
    ctx.fillText('MỌI HÀNH TRÌNH ĐỀU BẮT ĐẦU TỪ MỘT CON HẺM', 614, 565);
}

function drawIntro() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, "#161210");
    if (introVideo.readyState >= 2) {
        ctx.drawImage(introVideo, 0, 0, canvas.width, canvas.height);
    }

    const time = introVideo.currentTime;
    const scene = time < 5 ? 0 : time < 10 ? 1 : time < 14 ? 2 : 3;
    const captions = [
        "23:45 · Lại tăng ca. Ngày nào cũng bảng tính, rồi về nhà khi cả phố đã ngủ.",
        "Mở app ngân hàng xem thử… Mình vẫn còn 20 triệu.",
        "Đủ để bắt đầu với một xe cà phê. Sáng mai, mình làm thật.",
        "05:00 · Sài Gòn vừa thức giấc. Mẻ cà phê đầu tiên đã sẵn sàng."
    ];

    if (!introPlaybackFailed && introVideo.readyState >= 2) {
        if (scene === 0) {
            const typing = Math.floor(time * 5) % 4;
            drawBitmapCharacter(488, 322 + Math.floor(time / 2), playerConfig, 'left', typing, time < 3.4, 4.4);
        } else if (scene === 1) {
            drawBitmapCharacter(350, 302, playerConfig, 'right', 0, false, 5);
            const phoneTop = 132 + Math.round(Math.max(0, 1 - (time - 5) * 4) * 24);
            pOutlinedRect(ctx, 575, phoneTop, 265, 326, "#282531");
            pRect(ctx, 588, phoneTop + 16, 239, 290, "#fff3d6");
            pRect(ctx, 588, phoneTop + 16, 239, 73, "#3a675f");
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff3d6";
            ctx.font = "bold 19px 'Chakra Petch', sans-serif";
            ctx.fillText("TÀI KHOẢN", 708, phoneTop + 60);
            ctx.fillStyle = PAL.OUTLINE;
            ctx.font = "bold 15px 'Chakra Petch', sans-serif";
            ctx.fillText("Số dư khả dụng", 708, phoneTop + 137);
            ctx.font = "bold 28px 'Chakra Petch', sans-serif";
            ctx.fillText(playerStats.money.toLocaleString('vi-VN') + " ₫", 708, phoneTop + 181);
        } else if (scene === 2) {
            const step = Math.floor((time - 10) * 6) % 4;
            drawBitmapCharacter(486 + (time - 10) * 106, 332, playerConfig, 'right', step, true, 4.4);
        } else {
            const elapsed = time - 14;
            const cartX = Math.min(111, elapsed * 26 - 20) * 4;
            drawBitmapCharacter(cartX - 67, 345, playerConfig, 'right',
                Math.floor(elapsed * 6) % 4, elapsed < 4.95, 4.1);
        }
    }

    pRect(ctx, 0, 535, canvas.width, 115, "rgba(22, 18, 16, 0.86)");
    ctx.textAlign = "center";
    ctx.fillStyle = "#f0b643";
    ctx.font = "bold 21px 'Chakra Petch', sans-serif";
    ctx.fillText(scene === 3 ? "5AM" : playerConfig.name, canvas.width / 2, 575);
    ctx.fillStyle = "#fff3d6";
    ctx.font = "bold 19px 'Chakra Petch', sans-serif";
    ctx.fillText(introPlaybackFailed ? "Không phát được video. Nhấp để vào game." : captions[scene], canvas.width / 2, 610, 940);
    pOutlinedRect(ctx, 785, 18, 195, 42, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 15px 'Chakra Petch', sans-serif";
    ctx.fillText("Bỏ qua intro", 882, 44);
}

function drawArrowButton(x, y, text) {
    pOutlinedRect(ctx, x - 16, y - 16, 32, 32, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 6);
}

// Hiệu ứng màu bầu trời theo khung giờ + thời tiết Sài Gòn (Nắng gắt, Mưa rào, Bão lớn)
function drawZoneColorGradeOverlay() {
    // Mỗi khu có một sắc độ nhận diện riêng, phủ nhẹ để vẫn giữ được màu pixel gốc.
    const zoneGrades = {
        HOME_STREET: ['#e8a85e', 0.045],       // vàng ấm, khu phố thân quen
        BETTER_STREET: ['#b8cf91', 0.05],      // xanh dịu, khu dân cư khá giả
        VILLAS: ['#70aa70', 0.075],            // xanh vườn cây
        CANAL_MARKET: ['#55aaa5', 0.075],      // xanh ngọc ven kênh
        DOWNTOWN: ['#86a8c5', 0.065],          // xanh kính và đá đô thị
        OFFICE_DISTRICT: ['#788eae', 0.085],   // xanh thép công sở
        DISTRICT_1: ['#d276a9', 0.07],         // hồng tím phố đêm
        PARK: ['#c8d98a', 0.055],              // xanh non công viên
        ELDERLY_AREA: ['#c28b79', 0.065],      // đất nung phố cổ
        BREEZE_AREA: ['#55bdc9', 0.085],       // xanh biển đón gió
        DALAT_NIGHT: ['#9678bf', 0.09],        // tím chợ đêm
        DALAT_GREENHOUSE: ['#83c99a', 0.075],  // xanh nhà kính
        DALAT_PINE: ['#638b79', 0.08],         // xanh thông mát
        MEKONG_QUAY: ['#4aa6a2', 0.075],       // xanh sông nước
        MEKONG_FLOATING: ['#7eaa5b', 0.07],    // xanh miệt vườn
        MEKONG_CRAFT: ['#d2a35d', 0.07],       // vàng tre và gỗ
        VUNGTAU_BAI_SAU: ['#e6c477', 0.065],   // nắng cát
        VUNGTAU_FISHING: ['#56abb3', 0.075],   // xanh chợ cá
        VUNGTAU_LIGHTHOUSE: ['#7799bd', 0.085] // xanh biển sâu
    };
    const grade = zoneGrades[currentZone];
    if (!grade) return;
    pRect(ctx, 0, 0, canvas.width, canvas.height,
        `rgba(${parseInt(grade[0].slice(1, 3), 16)}, ${parseInt(grade[0].slice(3, 5), 16)}, ${parseInt(grade[0].slice(5, 7), 16)}, ${grade[1]})`);
}

function drawDayNightLightingOverlay() {
    const h = playerStats.hour;
    if (h >= 5.0 && h < 6.5) {
        // Bình minh 5AM vàng cam dịu nhẹ
        const alpha = (6.5 - h) / 1.5 * 0.22;
        pRect(ctx, 0, 0, canvas.width, canvas.height, `rgba(245, 170, 90, ${alpha.toFixed(3)})`);
    } else if (h >= 16.5 && h < 18.5) {
        // Hoàng hôn Sài Gòn ấm áp
        const progress = (h - 16.5) / 2.0;
        const alpha = progress * 0.30;
        pRect(ctx, 0, 0, canvas.width, canvas.height, `rgba(210, 95, 55, ${alpha.toFixed(3)})`);
    } else if (h >= 18.5) {
        // Buổi tối lên đèn
        const progress = Math.min(1, (h - 18.5) / 1.5);
        const alpha = 0.25 + progress * 0.25;
        pRect(ctx, 0, 0, canvas.width, canvas.height, `rgba(18, 22, 42, ${alpha.toFixed(3)})`);
    }

    if (currentGameState !== GAME_STATES.PLAYING_STREET) return;
    if (playerStats.weather === 'HOT') {
        pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(255, 175, 65, 0.09)");
    } else if (playerStats.weather === 'RAIN' || playerStats.weather === 'STORM') {
        const isStorm = (playerStats.weather === 'STORM');
        pRect(ctx, 0, 0, canvas.width, canvas.height, isStorm ? "rgba(20, 32, 54, 0.32)" : "rgba(32, 54, 82, 0.18)");
        const dropCount = isStorm ? 85 : 45;
        const windShift = isStorm ? 4 : 1;
        ctx.fillStyle = isStorm ? "rgba(210, 232, 255, 0.62)" : "rgba(190, 225, 255, 0.48)";
        for (let i = 0; i < dropCount; i++) {
            const rx = ((i * 97 + tickCount * (isStorm ? 9 : 4)) % (canvas.width + 60)) - 30;
            const ry = ((i * 73 + tickCount * (isStorm ? 16 : 11)) % (canvas.height + 40)) - 20;
            ctx.fillRect(rx, ry, 2, isStorm ? 14 : 10);
            if (windShift > 1) ctx.fillRect(rx - 2, ry + 5, 2, 7);
        }
        if (isStorm && (tickCount % 290 === 0 || tickCount % 290 === 3)) {
            pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(235, 245, 255, 0.24)");
        }
    }
}

function drawMinimalHUD(locationName) {
    const isMobileHUD = document.body.classList.contains('is-mobile');
    if (isMobileHUD) {
        // One shared backplate makes the separate pixel panels read as a single HUD.
        pOutlinedRect(ctx, 4, 0, canvas.width - 8, 72, "rgba(43, 29, 22, 0.78)");
    }
    // 1. Cụm Tiền & Thể lực
    pOutlinedRect(ctx, 10, 4, 308, 28, "rgba(236, 211, 171, 0.95)");
    ctx.font = "bold 14.5px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#963420";
    ctx.textAlign = "left";
    ctx.fillText("💰 " + playerStats.money.toLocaleString('vi-VN') + " đ", 18, 23, 162);

    ctx.fillStyle = "#c84b31";
    ctx.fillText(isMobileHUD ? `⚡${Math.round(playerStats.energy)}` : "⚡", 184, 23);
    pOutlinedRect(ctx, 204, 11, 104, 14, "#b5a496");
    const eColor = playerStats.energy > 30 ? "#4f8a46" : "#e74c3c";
    pRect(ctx, 206, 13, Math.max(0, (playerStats.energy / playerStats.maxEnergy) * 100), 10, eColor);

    // 2. Nút mở Sơ Đồ Khu Phố [M]
    pOutlinedRect(ctx, 324, 4, 126, 28, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🗺️ Sơ đồ [M]", 387, 23, 118);

    // 3. Kho nguyên liệu pha chế hiện tại (Cà phê, Sữa, Trái cây)
    pOutlinedRect(ctx, 456, 4, 252, 28, "rgba(236, 211, 171, 0.95)");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
        isMobileHUD
            ? `☕ ${inventory.coffee}  ·  🥛 ${inventory.milk}  ·  🍊 ${inventory.fruit}`
            : `🫘 Cà phê: ${inventory.coffee}  |  🥫 Sữa: ${inventory.milk}  |  🍊 Cam: ${inventory.fruit}`,
        582,
        23,
        242
    );

    // 4. Nút đổi tốc độ thời gian (1x / 2x)
    pOutlinedRect(ctx, 714, 4, 82, 28, playerStats.timeSpeedMultiplier === 2 ? "#e67e22" : "#dfd1b4");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("⏱️ " + playerStats.timeSpeedMultiplier + "x", 755, 23, 74);

    // 5. Đồng hồ Năm / Ngày (100 ngày/năm) / Thời tiết & Giờ chuẩn Stardew Valley
    const wInfo = getWeatherInfo();
    pOutlinedRect(ctx, canvas.width - 198, 4, 188, 28, "rgba(236, 211, 171, 0.95)");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
        `${wInfo.icon} N${playerStats.year}•Ng${playerStats.dayOfYear}/100 ${formatGameClock(playerStats.hour)}`,
        canvas.width - 16,
        23,
        178
    );

    pOutlinedRect(ctx, 840, 40, 148, 28, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.fillText("📖 Sổ tay [B]", 914, 59, 138);

    pOutlinedRect(ctx, 10, 40, 300, 28, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.fillText(
        isMobileHUD
            ? `🏅 TP ${cityReputation}/100 · Chặng ${getNPCSchedulePhase() + 1}/4`
            : `🏅 Danh tiếng ${cityReputation}/100 · Chặng ${getNPCSchedulePhase() + 1}/4 · Mục tiêu`,
        160,
        59,
        288
    );

    drawGuideBarInHUD();

    // Mobile controls already show the available actions and occupy the lower corners.
    if (!isMobileHUD) {
        pOutlinedRect(ctx, canvas.width - 320, canvas.height - 38, 308, 30, "#ecd3ab");
        ctx.fillStyle = PAL.SIGN_RED;
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("📍 " + locationName, canvas.width - 20, canvas.height - 18, 294);
    }
}

// ============================================================================
// CÁC BẢNG MODAL TƯƠNG TÁC: CHỢ CÔ BA, PHA CHẾ CÀ PHÊ & NGỦ TỔNG KẾT NGÀY
// ============================================================================

function drawStandardModalHeader({ x, y, w, title, titleAlign = 'center', titleSize = 17, titleColor = '#f0b643', headerColor = '#2b1d16', closeButton = true }) {
    pOutlinedRect(ctx, x + 8, y + 8, w - 16, 40, headerColor);

    ctx.fillStyle = titleColor;
    ctx.font = `bold ${titleSize}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = titleAlign;
    ctx.fillText(title, titleAlign === 'left' ? x + 18 : x + w / 2, y + 34, w - (titleAlign === 'left' ? 70 : 72));

    if (closeButton) {
        pOutlinedRect(ctx, x + w - 42, y + 10, 30, 28, "#c84b31");
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✖", x + w - 27, y + 29);
    }
}

function drawStandardModalFrame(options) {
    const { x, y, w, h } = options;
    pRect(ctx, x + 5, y + 5, w, h, "rgba(20, 14, 10, 0.45)");
    pOutlinedRect(ctx, x, y, w, h, "#ecd3ab");
    pOutlinedRect(ctx, x + 8, y + 8, w - 16, h - 16, "#fff6e5");
    drawStandardModalHeader(options);
}

function drawMarketModal() {
    if (!showMarketModal) return;
    const isEarly = playerStats.hour < GAME_CONFIG.TIME.EARLY_MARKET_BONUS_HOUR;

    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.76)");
    drawStandardModalFrame({
        x: 170,
        y: 80,
        w: 660,
        h: 480,
        title: "🛒 SẠP TẠP HÓA CÔ BA - CHỢ SỚM HẺM 54",
        titleSize: 18,
        closeButton: false
    });

    ctx.fillStyle = isEarly ? "#27ae60" : "#963420";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(
        isEarly
            ? "🌅 ƯU ĐÃI DẬY SỚM 5AM: Đang giảm giá sỉ 20% tất cả nguyên liệu (Trước 08:00 Sáng)!"
            : "💡 Mẹo: Đi chợ từ 05:00 - 08:00 sáng mỗi ngày sẽ được Cô Ba giảm giá 20%!",
        canvas.width / 2,
        166
    );

    const showBackpackRow = (playerStats.year >= 2 || playerStats.dayOfYear >= 75) && !yearTwo.backpack;
    const rowStart = showBackpackRow ? 174 : 185;
    const rowStep = showBackpackRow ? 64 : 72;
    const rowH = showBackpackRow ? 56 : 62;

    GAME_CONFIG.INGREDIENTS.forEach((item, idx) => {
        const rowY = rowStart + idx * rowStep;
        const price = getMarketItemPrice(item);
        pOutlinedRect(ctx, 210, rowY, 580, rowH, "#ecd3ab");

        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        const shelfLife = INGREDIENT_SHELF_LIFE[item.id] ? getIngredientShelfLife(item.id) : 0;
        ctx.fillText(`${item.icon} ${item.name} (+${item.packAmount})`, 228, rowY + 23);
        if (shelfLife) {
            ctx.fillStyle = shelfLife === 1 ? "#c0392b" : "#2e6b3e";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(`⏳ Hạn: ${shelfLife} ngày`, 620, rowY + 22);
            ctx.textAlign = "left";
        }

        ctx.fillStyle = "#4a3525";
        ctx.font = "13px 'Chakra Petch', sans-serif";
        ctx.fillText(item.desc, 228, rowY + (showBackpackRow ? 43 : 47), 398);

        // Nút Mua
        const canBuy = playerStats.money >= price;
        pOutlinedRect(ctx, 635, rowY + (showBackpackRow ? 8 : 11), 140, 40, canBuy ? "#4f8a46" : "#95a5a6");
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("MUA: " + price.toLocaleString('vi-VN') + "đ", 705, rowY + (showBackpackRow ? 33 : 36));
    });

    if (showBackpackRow) {
        const bpY = rowStart + GAME_CONFIG.INGREDIENTS.length * rowStep;
        const canBuyBp = playerStats.money >= 250000;
        pOutlinedRect(ctx, 210, bpY, 580, rowH, "#dfeccf");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("🎒 Ba Lô Đi Tỉnh Năm 2 (Sức chứa 8 đặc sản)", 228, bpY + 23);
        ctx.fillStyle = "#4a3525";
        ctx.font = "12.5px 'Chakra Petch', sans-serif";
        ctx.fillText("Dùng để gom đặc sản Đà Lạt, Miền Tây, Vũng Tàu mang về quán.", 228, bpY + 43);
        pOutlinedRect(ctx, 635, bpY + 8, 140, 40, canBuyBp ? "#4f8a46" : "#95a5a6");
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("MUA: 250.000đ", 705, bpY + 33);
    }

    pOutlinedRect(ctx, 430, 492, 140, 42, "#c84b31");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ĐÓNG [Q]", 500, 518);
}

function handleMarketModalClick(mx, my) {
    if (mx >= 430 && mx <= 570 && my >= 492 && my <= 534) {
        showMarketModal = false;
        return;
    }
    const showBackpackRow = (playerStats.year >= 2 || playerStats.dayOfYear >= 75) && !yearTwo.backpack;
    const rowStart = showBackpackRow ? 174 : 185;
    const rowStep = showBackpackRow ? 64 : 72;
    const btnOff = showBackpackRow ? 8 : 11;
    GAME_CONFIG.INGREDIENTS.forEach((item, idx) => {
        const rowY = rowStart + idx * rowStep;
        if (mx >= 635 && mx <= 775 && my >= rowY + btnOff && my <= rowY + btnOff + 40) {
            buyIngredientAtMarket(item);
        }
    });
    if (showBackpackRow) {
        const bpY = rowStart + GAME_CONFIG.INGREDIENTS.length * rowStep;
        if (mx >= 635 && mx <= 775 && my >= bpY + btnOff && my <= bpY + btnOff + 40) {
            triggerInteractable({ type: 'BACKPACK' });
        }
    }
}

function getBrewModalLayout(count) {
    const compact = count > 6;
    const mx = 602;
    const my = compact ? 78 : 152;
    const mw = 384;
    const mh = compact ? 544 : 468;
    const listTop = my + 82;
    const rowStep = compact ? Math.floor((mh - 104) / count) : 58;
    const rowH = compact ? Math.max(40, rowStep - 5) : 52;
    return { mx, my, mw, mh, listTop, rowStep, rowH, compact };
}

function drawBrewModal() {
    if (!showBrewModal) return;
    const recipes = getBrewDisplayRecipes();
    const unlockedCount = getAvailableRecipes().length;
    const layout = getBrewModalLayout(recipes.length);
    const { mx, my, mw, mh, listTop, rowStep, rowH, compact } = layout;
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const mult = (zInfo && zInfo.priceMultiplier ? zInfo.priceMultiplier : 1.0) * getDailyEventPriceMult(currentZone);
    const spotId = activeBrewSpot ? activeBrewSpot.spotId : null;
    const waitingHere = spotId ? getWaitingCustomersAtSpot(spotId) : [];
    const rank = getBaristaRank();

    drawStandardModalFrame({
        x: mx,
        y: my,
        w: mw,
        h: mh,
        title: `☕ MENU (${unlockedCount}/${recipes.length} món · x${Number(mult.toFixed(2))} · Lv.${rank.level})`,
        titleAlign: 'left',
        titleSize: 13.5
    });

    // Thanh trạng thái khách đang gọi món
    pOutlinedRect(ctx, mx + 14, my + 48, mw - 28, 28, waitingHere.length > 0 ? "#e8f6e8" : "#fbeee6");
    ctx.fillStyle = waitingHere.length > 0 ? "#2e592c" : "#c0392b";
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    if (waitingHere.length > 0) {
        const rcp = getRecipeByIndex(waitingHere[0].wantedRecipeIdx);
        const vipTag = waitingHere[0].isVipReviewer ? "⭐ VIP gọi: " : "🙋 Khách gọi: ";
        ctx.fillText(vipTag + rcp.icon + " " + rcp.name, mx + mw / 2, my + 67);
    } else {
        ctx.fillText("⏳ Đang chờ khách lại quầy gọi món...", mx + mw / 2, my + 67);
    }

    // Danh sách các món nước (3 món đầu + 3 món nhiệm vụ mở khóa + tối đa 3 món Signature)
    const business = spotId ? businesses[spotId] : null;
    const partnerShare = business?.partner?.share || 0;
    const reputationBonus = 1 + Math.min(0.15, customerReputation / 500);
    const cartSeatingTip = spotId === 'cart_mobile' && coffeeCart.seating ? 2000 : 0;

    recipes.forEach((rcp, idx) => {
        const rowY = listTop + idx * rowStep;
        const unlocked = isRecipeUnlocked(rcp.id);

        if (!unlocked) {
            const q = RECIPE_UNLOCK_QUESTS[rcp.id];
            pOutlinedRect(ctx, mx + 14, rowY, mw - 28, rowH, "#e2d5be");
            ctx.fillStyle = "#6c594b";
            ctx.font = compact ? "bold 11.5px 'Chakra Petch', sans-serif" : "bold 12.5px 'Chakra Petch', sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`🔒 ${rcp.icon} ${rcp.name}`, mx + 22, rowY + (compact ? 17 : 20), 232);
            ctx.fillStyle = "#8a5a36";
            ctx.font = compact ? "9.5px 'Chakra Petch', sans-serif" : "10.5px 'Chakra Petch', sans-serif";
            ctx.fillText(q ? q.shortProgress() : "Hoàn thành nhiệm vụ để mở", mx + 22, rowY + (compact ? 33 : 40), 240);

            const btnH = compact ? rowH - 10 : 34;
            const btnY = rowY + Math.floor((rowH - btnH) / 2);
            pOutlinedRect(ctx, mx + mw - 110, btnY, 90, btnH, "#8d7563");
            ctx.fillStyle = "#fff6e5";
            ctx.font = "bold 10.5px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("📜 NHIỆM VỤ", mx + mw - 65, btnY + Math.floor(btnH / 2) + 4);
            return;
        }

        const matchedWait = waitingHere.find((c) => getRecipeByIndex(c.wantedRecipeIdx).id === rcp.id);
        const grossPrice = Math.round(rcp.baseSellPrice * mult * priceOptions[dailyPriceIndex] * reputationBonus * rank.priceMult / 1000) * 1000;
        const regularBonus = matchedWait?.isRegularOrder ? Math.round(grossPrice * 0.1) : 0;
        const spouseCafeBonus = spouse && business?.type.id === 'cafe' ? Math.round(grossPrice * 0.1) : 0;
        const vipTip = matchedWait?.isVipReviewer ? Math.round(grossPrice * 0.8) : 0;
        const sellPrice = grossPrice + regularBonus + spouseCafeBonus + cartSeatingTip + vipTip - Math.round(grossPrice * partnerShare);
        const help = spouse && spotId === 'cart_mobile' && !Object.keys(rentedProperties).length
            ? marriageProfiles[spouse.id][1] : 0;
        const effEnergy = Math.max(1, rcp.energyCost - help - rank.energySave - (business?.upgrades?.machine ? 1 : 0));
        const hasIng = Object.entries(rcp.need).every(([k, v]) => (inventory[k] || 0) >= v);
        const isOrdered = Boolean(matchedWait);
        const isSig = Boolean(rcp.mentorId);

        pOutlinedRect(ctx, mx + 14, rowY, mw - 28, rowH, isOrdered ? "#f7ebd2" : (isSig ? "#f4e6f7" : "#ecd3ab"));

        ctx.fillStyle = isSig ? "#6c2c7a" : PAL.OUTLINE;
        ctx.font = compact ? "bold 12px 'Chakra Petch', sans-serif" : "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`[${idx + 1}] ${rcp.icon} ${rcp.name}`, mx + 22, rowY + (compact ? 17 : 21), 232);

        const ingTags = Object.entries(rcp.need).map(([k, v]) => {
            const ic = k === 'coffee' ? '🫘' : (k === 'milk' ? '🥫' : '🍊');
            return `${ic}${v}`;
        }).join(" ");
        ctx.fillStyle = "#5c4033";
        ctx.font = compact ? "10.5px 'Chakra Petch', sans-serif" : "11.5px 'Chakra Petch', sans-serif";
        ctx.fillText(`Cần: ${ingTags}  |  -${effEnergy}⚡`, mx + 22, rowY + (compact ? 34 : 41));

        const priceK = (sellPrice / 1000).toFixed(sellPrice % 1000 === 0 ? 0 : 1);
        let btnText = `BÁN +${priceK}k`;
        let btnColor = "#4f8a46";
        if (waitingHere.length === 0) {
            btnText = "CHỜ KHÁCH";
            btnColor = "#95a5a6";
        } else if (!isOrdered) {
            btnText = "KHÔNG GỌI";
            btnColor = "#95a5a6";
        } else if (!hasIng) {
            btnText = "THIẾU ĐỒ";
            btnColor = "#b5835a";
        } else if (playerStats.energy < effEnergy) {
            btnText = "CẠN ⚡!";
            btnColor = "#c84b31";
        }

        const btnH = compact ? rowH - 10 : 36;
        const btnY = rowY + Math.floor((rowH - btnH) / 2);
        const highlightTutorial = isTutorialActive() && tutorialStep === 2 && isOrdered && hasIng;
        pOutlinedRect(ctx, mx + mw - 118, btnY, 98, btnH, highlightTutorial && (Math.floor(tickCount / 14) % 2 === 0) ? "#f0b643" : btnColor);
        ctx.fillStyle = highlightTutorial && (Math.floor(tickCount / 14) % 2 === 0) ? "#2b1d16" : "#ffffff";
        ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(highlightTutorial ? "▶ BẤM PHA!" : btnText, mx + mw - 69, btnY + Math.floor(btnH / 2) + 4);
    });

    ctx.fillStyle = "#6e4736";
    ctx.font = "bold 10.5px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Phím [1]–[${recipes.length}] pha nhanh · Bấm món 🔒 xem nhiệm vụ | [Q] Đóng`, mx + mw / 2, my + mh - 12);
}

function handleBrewModalClick(mx, my) {
    const recipes = getBrewDisplayRecipes();
    const { mx: panelX, my: panelY, mw: panelW, mh: panelH, listTop, rowStep, rowH } = getBrewModalLayout(recipes.length);

    // Click ngoài bảng hoặc nút ✖ để đóng
    if (
        mx < panelX || mx > panelX + panelW || my < panelY || my > panelY + panelH ||
        (mx >= panelX + panelW - 42 && mx <= panelX + panelW - 12 && my >= panelY + 10 && my <= panelY + 38)
    ) {
        showBrewModal = false;
        return;
    }

    recipes.forEach((rcp, idx) => {
        const rowY = listTop + idx * rowStep;
        if (!isRecipeUnlocked(rcp.id)) {
            if (mx >= panelX + 14 && mx <= panelX + panelW - 14 && my >= rowY && my <= rowY + rowH) {
                GameAudio?.playClick();
                showToast(getRecipeQuestHint(rcp.id), 300);
            }
            return;
        }
        if (mx >= panelX + panelW - 118 && mx <= panelX + panelW - 20 && my >= rowY + 3 && my <= rowY + rowH - 3) {
            brewAndSellDrink(rcp);
        }
    });
}

function drawSleepSummaryModal() {
    if (!showSleepSummaryModal) return;
    const hospitalCost = dailyReport.hospitalCost || 0;
    const netProfit = dailyReport.revenue - dailyReport.ingredientCost - dailyReport.rentCost - hospitalCost;

    const chooseSlotOnSleep = needsFirstSaveSlotChoice && window.GameCloud?.isLoggedIn();
    const boxH = chooseSlotOnSleep ? 500 : 440;
    const boxY = chooseSlotOnSleep ? 72 : 95;

    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(12, 9, 7, 0.88)");
    drawStandardModalFrame({
        x: 210,
        y: boxY,
        w: 580,
        h: boxH,
        title: faintedInHospital
            ? "🏥 NHẬP VIỆN CẤP CỨU · TỔNG KẾT NGÀY " + playerStats.day
            : "🌙 SỔ TAY TỔNG KẾT CUỐI NGÀY " + playerStats.day,
        titleSize: 16,
        titleColor: faintedInHospital ? "#ffd7d7" : "#f0b643",
        headerColor: faintedInHospital ? "#7d2020" : "#2b1d16",
        closeButton: false
    });

    const rowBase = boxY + 96;
    const rowStep = faintedInHospital ? 30 : 36;
    ctx.textAlign = "left";
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText("☕ Số ly cà phê đã phục vụ:", 265, rowBase);
    ctx.textAlign = "right";
    ctx.fillText(dailyReport.cupsSold + " ly", 735, rowBase);

    ctx.textAlign = "left";
    ctx.fillStyle = "#27ae60";
    ctx.fillText("💰 Tổng doanh thu bán hàng:", 265, rowBase + rowStep);
    ctx.textAlign = "right";
    ctx.fillText("+" + dailyReport.revenue.toLocaleString('vi-VN') + " VNĐ", 735, rowBase + rowStep);

    ctx.textAlign = "left";
    ctx.fillStyle = "#c0392b";
    ctx.fillText("🛒 Chi phí mua nguyên liệu chợ:", 265, rowBase + rowStep * 2);
    ctx.textAlign = "right";
    ctx.fillText("-" + dailyReport.ingredientCost.toLocaleString('vi-VN') + " VNĐ", 735, rowBase + rowStep * 2);

    ctx.textAlign = "left";
    ctx.fillText("🏠 Chi phí đầu tư thuê mặt bằng:", 265, rowBase + rowStep * 3);
    ctx.textAlign = "right";
    ctx.fillText("-" + dailyReport.rentCost.toLocaleString('vi-VN') + " VNĐ", 735, rowBase + rowStep * 3);

    let lineY = rowBase + rowStep * 3 + 20;
    if (faintedInHospital) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#b02a2a";
        ctx.fillText("🏥 Viện phí cấp cứu (ngất xỉu):", 265, rowBase + rowStep * 4);
        ctx.textAlign = "right";
        ctx.fillText("-" + hospitalCost.toLocaleString('vi-VN') + " VNĐ", 735, rowBase + rowStep * 4);
        lineY = rowBase + rowStep * 4 + 18;
    }

    pRect(ctx, 260, lineY, 480, 3, PAL.OUTLINE);

    ctx.textAlign = "left";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillStyle = netProfit >= 0 ? "#27ae60" : "#c0392b";
    ctx.fillText("📊 LỢI NHUẬN RÒNG TRONG NGÀY:", 265, lineY + 30);
    ctx.textAlign = "right";
    ctx.fillText((netProfit >= 0 ? "+" : "") + netProfit.toLocaleString('vi-VN') + " VNĐ", 735, lineY + 30);

    const nextWakeHour = faintedInHospital
        ? Math.max(GAME_CONFIG.TIME.LATE_WAKE_UP_HOUR, getNextMorningWakeHour(playerStats.hour))
        : getNextMorningWakeHour(playerStats.hour);
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = (faintedInHospital || dailyReport.latePenalty) ? "#c0392b" : "#4f8a46";
    ctx.fillText(
        faintedInHospital
            ? `🚑 Kiệt sức ngất xỉu (-1.000.000đ)! Sáng mai xuất viện lúc ${formatGameClock(nextWakeHour)} (100% Thể lực).`
            : dailyReport.latePenalty
                ? `⚠️ Ngủ muộn (${formatGameClock(playerStats.hour)}) nên sáng mai sẽ dậy trễ lúc ${formatGameClock(nextWakeHour)}!`
                : "✨ Ngủ đúng giờ! Sáng mai bạn sẽ thức dậy lúc 05:00 Sáng với 100% Thể lực!",
        canvas.width / 2,
        lineY + 66
    );

    if (chooseSlotOnSleep) {
        ctx.fillStyle = "#6a4234";
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.fillText("💾 CHỌN 1 TRONG 3 Ô FILE SAVE ĐỂ LƯU TIẾN TRÌNH:", canvas.width / 2, 440);
        for (let i = 0; i < 3; i++) {
            const sx = 248 + i * 172;
            const sv = GameCloud.slots[i];
            const isSel = GameCloud.activeSlot === i;
            pOutlinedRect(ctx, sx, 452, 160, 54, isSel ? "#f0b643" : "#fffdf9");
            ctx.fillStyle = PAL.OUTLINE;
            ctx.font = "bold 13px 'Chakra Petch', sans-serif";
            ctx.fillText(`Ô ${i + 1}${isSel ? " ✓" : ""}`, sx + 80, 472);
            ctx.font = "11px 'Chakra Petch', sans-serif";
            ctx.fillStyle = sv ? "#8b3a2b" : "#4f8a46";
            ctx.fillText(
                sv ? `${sv.playerConfig?.name || 'Cũ'} (Ng${sv.playerStats?.dayOfYear || 1})` : "(Trống - Lưu mới)",
                sx + 80, 493, 148
            );
        }
        if (!sleepForcedByMidnight) {
            pOutlinedRect(ctx, 248, 518, 340, 44, "#4f8a46");
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14px 'Chakra Petch', sans-serif";
            ctx.fillText(`🌅 LƯU VÀO Ô ${GameCloud.activeSlot + 1} & QUA NGÀY [E]`, 418, 545);
            pOutlinedRect(ctx, 598, 518, 154, 44, "#c84b31");
            ctx.fillStyle = "#ffffff";
            ctx.fillText("❌ Thoát [ESC]", 675, 545);
        } else {
            pOutlinedRect(ctx, 320, 518, 360, 44, "#4f8a46");
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 15px 'Chakra Petch', sans-serif";
            ctx.fillText(`🌅 LƯU VÀO Ô ${GameCloud.activeSlot + 1} & QUA NGÀY MỚI [E]`, canvas.width / 2, 546);
        }
    } else {
        if (!sleepForcedByMidnight) {
            pOutlinedRect(ctx, 250, 455, 310, 50, "#4f8a46");
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 15px 'Chakra Petch', sans-serif";
            ctx.fillText("🌅 BẮT ĐẦU NGÀY MỚI [E]", 405, 486);
            pOutlinedRect(ctx, 572, 455, 178, 50, "#c84b31");
            ctx.fillStyle = "#ffffff";
            ctx.fillText("❌ Thoát giường [ESC]", 661, 486);
        } else {
            pOutlinedRect(ctx, 350, 455, 300, 50, "#4f8a46");
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 16px 'Chakra Petch', sans-serif";
            ctx.fillText("🌅 BẮT ĐẦU NGÀY MỚI [Phím E]", canvas.width / 2, 486);
        }
    }
}

// ============================================================================
// VẼ CÁC ĐỐI TƯỢNG TRÊN PHỐ (TRONG HỆ TỌA ĐỘ THẾ GIỚI 2000x1400)
// ============================================================================

function drawRentalBadgesInWorld() {
    const rentals = GAME_CONFIG.RENTALS[currentZone] || [];
    for (const r of rentals) {
        const isRented = !!rentedProperties[r.id];
        const priceMil = (r.price / 1000000).toFixed(1).replace('.0', '') + " TR/THÁNG";
        const badgeW = 162;
        const badgeX = r.doorX - badgeW / 2;
        const badgeY = r.doorY - 46;

        if (isRented) {
            const biz = businesses[r.id];
            const overdue = Boolean(biz?.rentOverdue);
            pOutlinedRect(ctx, badgeX - 10, badgeY, badgeW + 20, 28, overdue ? "#e74c3c" : "#2ecc71");
            ctx.fillStyle = overdue ? "#ffffff" : "#143821";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
                overdue
                    ? `⚠️ NỢ THUÊ · ${(biz?.type.name || "Quán").toUpperCase()}`
                    : (biz?.type.name || "Quán cà phê").toUpperCase() + " · " + playerConfig.name,
                r.doorX, badgeY + 18, badgeW + 12
            );
        } else {
            const pulse = Math.sin(tickCount * 0.08) * 2.5;
            pOutlinedRect(ctx, badgeX, badgeY + pulse, badgeW, 26, "#fff3d6");
            pRect(ctx, badgeX + 2, badgeY + 2 + pulse, badgeW - 4, 22, "#c84b31");
            ctx.fillStyle = "#f0b643";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🏷️ THUÊ: " + priceMil, r.doorX, badgeY + 17 + pulse);
        }
    }
}

function drawDirectionSignpostsInWorld() {
    const zoneCfg = GAME_CONFIG.ZONES[currentZone];
    if (!zoneCfg) return;
    const conn = zoneCfg.connections;

    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";

    if (conn.left) {
        const leftName = GAME_CONFIG.ZONES[conn.left].name;
        pOutlinedRect(ctx, 20, 580, 165, 30, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText("⬅ " + leftName, 102, 600);
    }
    if (conn.right) {
        const rightName = GAME_CONFIG.ZONES[conn.right].name;
        pOutlinedRect(ctx, WORLD_W - 185, 580, 165, 30, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(rightName + " ➡", WORLD_W - 102, 600);
    }
    if (conn.up) {
        const upName = GAME_CONFIG.ZONES[conn.up].name;
        pOutlinedRect(ctx, 915, 24, 175, 30, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText("⬆ " + upName, 1002, 44);
    }
    if (conn.down) {
        const downName = GAME_CONFIG.ZONES[conn.down].name;
        pOutlinedRect(ctx, 915, WORLD_H - 54, 175, 30, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText("⬇ " + downName, 1002, WORLD_H - 34);
    }
}

function drawStreetCustomersInWorld() {
    streetCustomers.forEach((cust) => {
        const cfg = {
            genderIndex: cust.name.startsWith("Chị") || cust.name.startsWith("Bạn") ? 1 : 0,
            outfitIndex: 0,
            outfits: [{ color: cust.shirt, shadow: "#3d352e", shorts: cust.shorts }],
            accessoryIndex: 0,
            accessories: [{ type: "none" }]
        };
        const faceDir = (cust.state === 'waiting_order') ? 'up' : (cust.dir > 0 ? 'right' : 'left');
        const isMoving = (cust.state !== 'waiting_order');
        drawBitmapCharacter(cust.x, cust.y, cfg, faceDir, cust.animFrame, isMoving, 1.4);

        // Chỉ hiện bong bóng món đồ uống khi khách đang đi tới quầy hoặc đứng chờ gọi món
        if (cust.state === 'going_to_spot' || cust.state === 'waiting_order') {
            const rcp = getRecipeByIndex(cust.wantedRecipeIdx);
            if (rcp) {
                pOutlinedRect(ctx, cust.x + 4, cust.y - 26, 28, 22, cust.isVipReviewer ? "#ffe066" : "#fff6e5");
                ctx.fillStyle = PAL.OUTLINE;
                ctx.font = "bold 12px 'Chakra Petch', sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(rcp.icon, cust.x + 18, cust.y - 10);
                if (cust.isVipReviewer) {
                    const bob = Math.sin(tickCount * 0.14) * 2;
                    pOutlinedRect(ctx, cust.x - 4, cust.y - 45 + bob, 44, 16, "#f0b643");
                    ctx.fillStyle = "#7b241c";
                    ctx.font = "bold 9.5px 'Chakra Petch', sans-serif";
                    ctx.fillText("⭐ VIP", cust.x + 18, cust.y - 33 + bob);
                }
            }
        }
    });
}

function drawRentalModal() {
    if (!selectedRentalModal) return;
    const r = selectedRentalModal;
    if (businessDraft) {
        drawBusinessDraft(r);
        return;
    }
    const isRented = !!rentedProperties[r.id];
    const requiredReputation = getRentalReputationRequirement(r);
    const hasRequiredReputation = cityReputation >= requiredReputation;
    const canAfford = playerStats.money >= r.price && hasRequiredReputation;

    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.72)");
    drawStandardModalFrame({
        x: 220,
        y: 130,
        w: 560,
        h: 360,
        title: "📋 HỒ SƠ MẶT BẰNG KINH DOANH",
        titleSize: 17,
        closeButton: false
    });

    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillText("🏠 Tên mặt bằng: " + r.name, 260, 222);

    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#c84b31";
    ctx.fillText("💰 Giá thuê định kỳ (25 ngày): " + r.price.toLocaleString('vi-VN') + " VNĐ", 260, 255);

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("📐 Diện tích: " + r.area + "   |   🔥 Lưu lượng khách: " + r.traffic, 260, 286);
    ctx.fillText("👥 Khách hàng: " + r.customerType, 260, 316);

    pOutlinedRect(ctx, 256, 332, 488, 44, "#ecd3ab");
    ctx.fillStyle = "#4a3525";
    ctx.font = "13px 'Chakra Petch', sans-serif";
    ctx.fillText("💡 " + r.desc, 268, 359);

    if (!hasRequiredReputation && !isRented) {
        ctx.fillStyle = "#c0392b";
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🔒 Cần ${requiredReputation} danh tiếng thành phố (hiện có ${cityReputation})`, canvas.width / 2, 398);
    } else if (!canAfford && !isRented) {
        ctx.fillStyle = "#c0392b";
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        const missing = (r.price - playerStats.money).toLocaleString('vi-VN');
        ctx.fillText("⚠️ Vốn khởi nghiệp hiện tại chưa đủ (Thiếu " + missing + " đ)", canvas.width / 2, 398);
    }

    const btnColor = isRented ? "#2ecc71" : (canAfford ? "#4f8a46" : "#95a5a6");
    pOutlinedRect(ctx, 310, 415, 210, 45, btnColor);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isRented ? "MỞ BÁN TẠI QUÁN [E]" : (hasRequiredReputation ? "CHỌN NGÀNH [E]" : "CHƯA ĐỦ DANH TIẾNG"), 415, 443);

    pOutlinedRect(ctx, 540, 415, 140, 45, "#c84b31");
    ctx.fillStyle = "#ffffff";
    ctx.fillText("ĐÓNG [Q]", 610, 443);
}

const MAP_NODES = [
    { id: 'PLAYING_HOME', label: 'NHÀ CỦA MÌNH', sub: 'Hẻm 54 (Ngủ & Nghỉ)', x: 230, y: 120, w: 155, h: 64 },
    { id: 'VILLAS', label: 'KHU BIỆT THỰ', sub: 'Nhà vườn', x: 55, y: 120, w: 155, h: 72 },
    { id: 'CANAL_MARKET', label: 'CHỢ KÊNH', sub: 'Chợ ven kênh', x: 55, y: 415, w: 155, h: 74 },
    { id: 'BETTER_STREET', label: 'KHU PHỐ ĐẮT HƠN', sub: 'Giá bán x1.25', x: 55, y: 265, w: 155, h: 74 },
    { id: 'HOME_STREET', label: 'KHU PHỐ NHÀ MÌNH', sub: 'Chợ Sớm & Xe Cà Phê', x: 230, y: 265, w: 155, h: 74 },
    { id: 'OFFICE_DISTRICT', label: 'KHU VĂN PHÒNG', sub: 'Giá bán x1.65', x: 430, y: 120, w: 165, h: 72 },
    { id: 'DOWNTOWN', label: 'TRUNG TÂM SẦM UẤT', sub: 'Giá bán x1.85', x: 430, y: 265, w: 165, h: 74 },
    { id: 'DISTRICT_1', label: 'QUẬN 1 (PHỐ ĐÊM)', sub: 'Giá bán x2.1', x: 430, y: 415, w: 165, h: 74 },
    { id: 'ELDERLY_AREA', label: 'KHU NGƯỜI GIÀ', sub: 'Giá bán x1.6', x: 660, y: 120, w: 165, h: 72 },
    { id: 'PARK', label: 'CÔNG VIÊN', sub: 'Giá bán x1.4', x: 660, y: 265, w: 165, h: 74 },
    { id: 'BREEZE_AREA', label: 'KHU ĐÓN GIÓ', sub: 'Bến xe liên tỉnh', x: 660, y: 415, w: 165, h: 74 }
];

const PROVINCE_MAPS = {
    VUNGTAU: {
        title: 'VŨNG TÀU · TUYẾN VEN BIỂN',
        nodes: [
            { id: 'VUNGTAU_BAI_SAU', label: 'BÃI SAU', sub: 'Bãi tắm · Phố nghỉ dưỡng', x: 88, y: 256, w: 250, h: 104 },
            { id: 'VUNGTAU_FISHING', label: 'CHỢ CÁ LÀNG CHÀI', sub: 'Phiên chợ · Hải sản tươi', x: 375, y: 256, w: 250, h: 104 },
            { id: 'VUNGTAU_LIGHTHOUSE', label: 'HẢI ĐĂNG & MŨI ĐÁ', sub: 'Ngọn hải đăng · Ngắm biển', x: 662, y: 256, w: 250, h: 104 }
        ]
    },
    DALAT: {
        title: 'ĐÀ LẠT · BA ĐIỂM ĐẾN',
        nodes: [
            { id: 'DALAT_NIGHT', label: 'CHỢ ĐÊM & PHỐ DỐC', sub: 'Chợ đêm · Mặt bằng', x: 88, y: 256, w: 250, h: 104 },
            { id: 'DALAT_GREENHOUSE', label: 'THUNG LŨNG NHÀ KÍNH', sub: 'Dâu tây · Hoa · Arabica', x: 375, y: 256, w: 250, h: 104 },
            { id: 'DALAT_PINE', label: 'ĐỒI THÔNG & GA CỔ', sub: 'Nhà ga · Biệt thự · Rừng thông', x: 662, y: 256, w: 250, h: 104 }
        ]
    },
    MEKONG: {
        title: 'MIỀN TÂY · BA ĐIỂM ĐẾN',
        nodes: [
            { id: 'MEKONG_QUAY', label: 'BẾN NINH KIỀU', sub: 'Bến tàu · Phố ven sông', x: 88, y: 256, w: 250, h: 104 },
            { id: 'MEKONG_FLOATING', label: 'CHỢ NỔI MIỆT VƯỜN', sub: 'Ghe hàng · Cây bẹo', x: 375, y: 256, w: 250, h: 104 },
            { id: 'MEKONG_CRAFT', label: 'LÀNG NGHỀ VEN RẠCH', sub: 'Dệt lụa · Đan lát', x: 662, y: 256, w: 250, h: 104 }
        ]
    }
};

function getCurrentProvinceMap() {
    if (currentZone.startsWith('VUNGTAU_')) return PROVINCE_MAPS.VUNGTAU;
    if (currentZone.startsWith('DALAT_')) return PROVINCE_MAPS.DALAT;
    if (currentZone.startsWith('MEKONG_')) return PROVINCE_MAPS.MEKONG;
    return null;
}

function drawNPCSchedulePanel() {
    const phase = getNPCSchedulePhase();
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.78)");
    drawStandardModalFrame({
        x: 32,
        y: 70,
        w: 936,
        h: 510,
        title: '👥 LỊCH NHÂN VẬT',
        titleAlign: 'left',
        titleSize: 18,
        closeButton: false
    });
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`Giai đoạn ${phase + 1}/4 · Ngày ${phase * 25 + 1}–${(phase + 1) * 25} · Hiện tại ${formatGameClock(playerStats.hour)}`, 54, 137);
    pOutlinedRect(ctx, 825, 84, 121, 34, '#c84b31');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG [L / Q]", 885, 106);

    npcScheduleZones.forEach((zone, index) => {
        const x = 54 + (index % 5) * 179;
        const y = 157 + Math.floor(index / 5) * 38;
        pOutlinedRect(ctx, x, y, 171, 32, zone === scheduleZone ? "#f0b643" : "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(GAME_CONFIG.ZONES[zone].name, x + 9, y + 21, 153);
    });

    npcRosters[scheduleZone].forEach((npc, index) => {
        const y = 238 + index * 46;
        pOutlinedRect(ctx, 54, y, 892, 41, "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(npc.name, 66, y + 25, 215);
        const schedule = getNPCSchedule(scheduleZone, index);
        const width = Math.min(214, 642 / schedule.length);
        schedule.forEach(({ start, end, zone, spot, shop }, slot) => {
            const x = 294 + slot * width;
            if (playerStats.hour >= start && playerStats.hour < end) {
                pRect(ctx, x - 4, y + 4, width - 7, 33, "#f0b643");
            }
            ctx.fillStyle = PAL.OUTLINE;
            const startTime = String(start).padStart(2, '0') + ':00';
            const endTime = String(end).padStart(2, '0') + ':00';
            ctx.fillText(`${startTime}–${endTime}`, x, y + 15, width - 12);
            ctx.fillText(shop ? spot.label :
                `${GAME_CONFIG.ZONES[zone].name} · ${spot.label}`, x, y + 31, width - 12);
        });
    });

    ctx.fillText("Chọn khu nhà của NPC ở trên. Mỗi ô ghi khu đến và điểm hẹn trên vỉa hè.", 54, 534);
    ctx.fillText("Ô vàng là điểm hẹn hiện tại. Đến gần nhân vật rồi nhấn [E] để trò chuyện hoặc mời nước.", 54, 557);
}

function drawNPCSchedule() {
    if (!showNPCSchedule) return;
    drawNPCSchedulePanel();
}

function handleNPCScheduleClick(x, y) {
    if (x >= 825 && x <= 946 && y >= 84 && y <= 118) {
        closeAllModals();
        GameAudio?.playModalClose();
        return;
    }
    npcScheduleZones.forEach((zone, index) => {
        const left = 54 + (index % 5) * 179;
        const top = 157 + Math.floor(index / 5) * 38;
        if (x >= left && x <= left + 171 && y >= top && y <= top + 32) scheduleZone = zone;
    });
}

function drawMapModal() {
    if (!showMapModal) return;
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.78)");
    const provinceMap = currentGameState === GAME_STATES.PLAYING_STREET ? getCurrentProvinceMap() : null;
    drawStandardModalFrame({
        x: 35,
        y: 45,
        w: 930,
        h: 545,
        title: provinceMap
            ? `🗺️ ${provinceMap.title}`
            : "🗺️ SƠ ĐỒ CÁC KHU PHỐ & HỆ SỐ GIÁ BÁN (CLICK ĐỂ DI CHUYỂN NHANH)",
        titleSize: provinceMap ? 20 : 16,
        closeButton: false
    });

    if (provinceMap) {
        ctx.strokeStyle = '#6c5542';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(338, 308); ctx.lineTo(375, 308);
        ctx.moveTo(625, 308); ctx.lineTo(662, 308);
        ctx.stroke();
        for (const node of provinceMap.nodes) {
            const isHere = currentZone === node.id;
            pOutlinedRect(ctx, node.x, node.y, node.w, node.h, isHere ? '#f0b643' : '#ecd3ab');
            pOutlinedRect(ctx, node.x + 5, node.y + 5, node.w - 10, node.h - 10, isHere ? '#c84b31' : '#fffdf9');
            ctx.fillStyle = isHere ? '#ffffff' : PAL.OUTLINE;
            ctx.font = "bold 15px 'Chakra Petch', sans-serif";
            ctx.fillText(node.label, node.x + node.w / 2, node.y + 44);
            ctx.fillStyle = isHere ? '#f0b643' : '#963420';
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.fillText(node.sub, node.x + node.w / 2, node.y + 72);
            if (isHere) {
                ctx.fillStyle = '#2ecc71'; ctx.font = "bold 11px 'Chakra Petch', sans-serif";
                ctx.fillText('★ BẠN ĐANG Ở ĐÂY', node.x + node.w / 2, node.y - 10);
            }
        }
        pOutlinedRect(ctx, 845, 68, 92, 34, '#c84b31');
        ctx.fillStyle = '#ffffff'; ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.fillText('ĐÓNG [M]', 891, 90);
        ctx.fillStyle = PAL.OUTLINE; ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText('Ba khu nối liền theo một trục ngang. Đi bộ sang khu bên cạnh bằng phím A / D.', canvas.width / 2, 500);
        ctx.fillText('Sơ đồ chỉ cho chuyển nhanh bên trong tỉnh trong ngày xe khách.', canvas.width / 2, 530);
        return;
    }

    ctx.strokeStyle = PAL.OUTLINE;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(132, 192);
    ctx.lineTo(132, 415);
    ctx.moveTo(210, 156);
    ctx.lineTo(430, 156);
    ctx.moveTo(210, 452);
    ctx.lineTo(430, 452);
    ctx.moveTo(210, 302);
    ctx.lineTo(660, 302);
    ctx.moveTo(302, 184);
    ctx.lineTo(302, 265);
    ctx.moveTo(512, 192);
    ctx.lineTo(512, 415);
    ctx.moveTo(742, 192);
    ctx.lineTo(742, 415);
    ctx.moveTo(595, 156);
    ctx.lineTo(660, 156);
    ctx.moveTo(595, 452);
    ctx.lineTo(660, 452);
    ctx.stroke();

    for (const node of MAP_NODES) {
        const isHere = (currentGameState === GAME_STATES.PLAYING_HOME && node.id === 'PLAYING_HOME') ||
                       (currentGameState === GAME_STATES.PLAYING_STREET && currentZone === node.id);

        pOutlinedRect(ctx, node.x, node.y, node.w, node.h, isHere ? "#f0b643" : "#ecd3ab");
        pOutlinedRect(ctx, node.x + 4, node.y + 4, node.w - 8, node.h - 8, isHere ? "#c84b31" : "#fffdf9");

        ctx.fillStyle = isHere ? "#ffffff" : PAL.OUTLINE;
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x + node.w / 2, node.y + 29);

        ctx.fillStyle = isHere ? "#f0b643" : "#963420";
        ctx.font = "bold 11px 'Chakra Petch', sans-serif";
        ctx.fillText(node.sub, node.x + node.w / 2, node.y + 50);

        // Các biểu tượng đánh dấu thông minh trên từng khu
        if (node.id !== 'PLAYING_HOME') {
            const badges = [];
            if (!coffeeCart.isPushed && coffeeCart.zone === node.id) badges.push(coffeeCart.seized ? '🚫' : '☕');
            if (activeDeliveryOrder?.zoneKey === node.id) badges.push('🛵');
            if (node.id === 'PARK' && getTodayFestival()) badges.push('🎉');
            if (dailyQuest && !dailyQuest.completed && dailyQuest.targetZone === node.id) badges.push('📋');
            if (dailyEvent?.zoneIds?.includes(node.id)) badges.push('🔥');
            const shopCount = Object.values(businesses).filter((b) => b.zone === node.id && !b.pending).length;
            if (shopCount > 0) badges.push(shopCount > 1 ? `🏠${shopCount}` : '🏠');

            if (badges.length > 0) {
                const text = badges.join(' ');
                ctx.font = "bold 11px 'Chakra Petch', sans-serif";
                const bw = Math.max(26, ctx.measureText(text).width + 10);
                const bx = node.x + node.w - bw - 2;
                const by = node.y + node.h - 14;
                pOutlinedRect(ctx, bx, by, bw, 18, "#fff3d6");
                ctx.fillStyle = PAL.OUTLINE;
                ctx.textAlign = "center";
                ctx.fillText(text, bx + bw / 2, by + 13);
            }
        }

        if (isHere) {
            ctx.fillStyle = "#2ecc71";
            ctx.font = "bold 11px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("★ BẠN ĐANG Ở ĐÂY", node.x + node.w / 2, node.y - 6);
        }
    }

    pOutlinedRect(ctx, 845, 68, 92, 34, "#c84b31");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ĐÓNG [M]", 891, 90);

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("☕ Xe CF  ·  🛵 Ship hàng  ·  📋 Nhiệm vụ  ·  🎉 Lễ hội  ·  🔥 Sự kiện  ·  🏠 Quán của bạn  (Click ô để đi nhanh)", canvas.width / 2, 552, 880);
}

function handleMapModalClick(mx, my) {
    if (mx >= 845 && mx <= 937 && my >= 68 && my <= 102) {
        showMapModal = false;
        return;
    }
    const provinceMap = currentGameState === GAME_STATES.PLAYING_STREET ? getCurrentProvinceMap() : null;
    if (provinceMap) {
        for (const node of provinceMap.nodes) {
            if (mx >= node.x && mx <= node.x + node.w && my >= node.y && my <= node.y + node.h) {
                showMapModal = false;
                currentGameState = GAME_STATES.PLAYING_STREET;
                const isDalatPine = node.id === 'DALAT_PINE';
                switchZone(node.id, isDalatPine ? 1400 : 970, isDalatPine ? 600 : 965, 'down');
                return;
            }
        }
        return;
    }
    for (const node of MAP_NODES) {
        if (mx >= node.x && mx <= node.x + node.w && my >= node.y && my <= node.y + node.h) {
            showMapModal = false;
            if (node.id === 'PLAYING_HOME') {
                if (coffeeCart.isPushed) {
                    GameAudio?.playError();
                    showToast("⚠️ Hãy nhấn [G] đậu Xe Cà Phê trước khi về phòng ngủ nhé!");
                    return;
                }
                activeVehicle = null;
                ridingBicycle = false;
                currentGameState = GAME_STATES.PLAYING_HOME;
                player.x = 500;
                player.y = 325;
                showToast("🏠 Đã về: Nhà riêng (Hẻm 54) - Lại gần giường nhấn [E] để đi ngủ");
            } else {
                currentGameState = GAME_STATES.PLAYING_STREET;
                switchZone(node.id, 945, 470, 'down');
            }
            return;
        }
    }
}

function drawInteractionBanner() {
    if (isAnyModalOpen()) return;
    let text = null;
    if (nearbyInteractable) {
        text = nearbyInteractable.label;
    } else if (nearbyRental) {
        text = "🏠 " + nearbyRental.name + " (" + nearbyRental.price.toLocaleString('vi-VN') + "đ/tháng) - Nhấn [E] hoặc Click để xem!";
    }
    if (!text) return;

    const promptW = Math.min(880, Math.max(500, text.length * 9.4 + 48));
    pOutlinedRect(ctx, canvas.width / 2 - promptW / 2, 74, promptW, 40, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 15.5px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 100, promptW - 24);
}

function calendarCell(index) {
    return { x: 61 + (index % 5) * 177, y: 151 + Math.floor(index / 5) * 70 };
}

function drawWallCalendar() {
    if (!showWallCalendar) return;
    const firstDay = getNPCSchedulePhase() * 25 + 1;
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.78)");
    drawStandardModalFrame({
        x: 40,
        y: 62,
        w: 920,
        h: 540,
        title: `📅 NĂM ${playerStats.year} · NGÀY ${firstDay}–${firstDay + 24}`,
        titleAlign: 'left',
        titleSize: 18,
        closeButton: false
    });
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.OUTLINE;
    pOutlinedRect(ctx, 835, 83, 105, 35, '#c84b31');
    ctx.textAlign = "center";
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG [Q]", 887, 106);
    ensureChapterProgress();
    const goal = getCurrentChapterGoal();
    const goalProgress = chapterProgress.completed ? goal.target : chapterProgress.value;
    ctx.textAlign = "left";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(`Chặng ${chapterProgress.phase + 1}/4 · Mục tiêu: ${goal.title} (${goalProgress}/${goal.target})${chapterProgress.completed ? ' · Đã hoàn thành' : ''}`, 61, 132, 620);
    ctx.textAlign = "right";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(`Danh tiếng thành phố: ${cityReputation}/100`, 935, 132);
    ctx.textAlign = "left";

    for (let index = 0; index < 25; index++) {
        const day = firstDay + index;
        const { x, y } = calendarCell(index);
        const festival = yearFestivals.find((event) => event.day === day);
        const birthday = storyNPCs.find((npc) => npc.birthday === day);
        pOutlinedRect(ctx, x, y, 166, 61, day === selectedCalendarDay ? "#f7d794" : "#fff6e5");
        ctx.fillStyle = PAL.OUTLINE;
        const dayLabel = day === playerStats.dayOfYear ? `${day} · Hôm nay` : String(day);
        const playerBirthday = day === playerConfig.birthday ? " · 🎂 Bạn" : "";
        ctx.fillText(dayLabel + playerBirthday, x + 8, y + 17, 150);
        ctx.fillStyle = PAL.SIGN_RED;
        if (festival) ctx.fillText(festival.name, x + 8, y + 35, 150);
        ctx.fillStyle = "#79507e";
        if (birthday) ctx.fillText(`🎂 ${birthday.name}`, x + 8, y + 53, 150);
    }

    const festival = yearFestivals.find((event) => event.day === selectedCalendarDay);
    const birthday = storyNPCs.find((npc) => npc.birthday === selectedCalendarDay);
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`Ngày ${selectedCalendarDay}`, 61, 505);
    if (festival) ctx.fillText(`🎉 ${festival.name} · Công Viên · 09:00–21:00`, 61, 529);
    if (birthday) ctx.fillText(`🎂 Sinh nhật ${birthday.name} · Mời nước được gấp đôi điểm thân thiết`, 61, 553);
    const selectedAbsoluteDay = (playerStats.year - 1) * GAME_CONFIG.TIME.DAYS_PER_YEAR + selectedCalendarDay;
    if (weddingDay === selectedAbsoluteDay) ctx.fillText("💍 Lễ cưới · Công Viên · 09:00–21:00", 480, 529);
    if (selectedCalendarDay === playerConfig.birthday) {
        ctx.fillText(`🎂 Sinh nhật của ${playerConfig.name}`, 61, 577);
    } else if (!festival && !birthday) {
        ctx.fillText("Không có lễ hội hoặc sinh nhật.", 61, 529);
    }
    if (dailyQuest) {
        ctx.textAlign = "right";
        ctx.fillStyle = dailyQuest.completed ? "#2e7d32" : "#8b3a2b";
        ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
        ctx.fillText(
            dailyQuest.completed
                ? `✅ Nhiệm vụ hôm nay: ${dailyQuest.title} (Xong)`
                : `📋 Nhiệm vụ ngày: ${dailyQuest.title} (${dailyQuest.progress}/${dailyQuest.target})`,
            935, 577, 460
        );
        ctx.textAlign = "left";
    }
}

function handleWallCalendarClick(x, y) {
    if (x >= 835 && x <= 940 && y >= 83 && y <= 118) {
        closeAllModals();
        return;
    }
    for (let index = 0; index < 25; index++) {
        const cell = calendarCell(index);
        if (x >= cell.x && x <= cell.x + 166 && y >= cell.y && y <= cell.y + 61) {
            selectedCalendarDay = getNPCSchedulePhase() * 25 + index + 1;
            return;
        }
    }
}

function drawHome() {
    ctx.drawImage(homeBgCanvas, 0, 0);
    const { x, y, w, h } = wallCalendar;
    pOutlinedRect(ctx, x, y, w, h, "#fff6e5");
    pOutlinedRect(ctx, x, y, w, 24, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("Lịch treo tường", x + w / 2, y + 17);
    ctx.fillText(`Ngày ${playerStats.dayOfYear}/100`, x + w / 2, y + 43);

    // Tivi retro dự báo thời tiết trong phòng
    pRect(ctx, roomTV.x + 22, roomTV.y - 10, 2, 10, "#4b3935");
    pRect(ctx, roomTV.x + 42, roomTV.y - 10, 2, 10, "#4b3935");
    pOutlinedRect(ctx, roomTV.x, roomTV.y, roomTV.w, roomTV.h, "#5d4037");
    pOutlinedRect(ctx, roomTV.x + 5, roomTV.y + 5, roomTV.w - 18, roomTV.h - 14, "#4fa4b8");
    pRect(ctx, roomTV.x + 9, roomTV.y + 9, 14, 4, "rgba(255,255,255,0.45)");
    pRect(ctx, roomTV.x + roomTV.w - 10, roomTV.y + 10, 5, 5, "#f0b643");
    pRect(ctx, roomTV.x + roomTV.w - 10, roomTV.y + 20, 5, 5, "#c84b31");
    ctx.fillStyle = "#fff6e5";
    ctx.font = "bold 10px 'Chakra Petch', sans-serif";
    ctx.fillText("TV [E]", roomTV.x + (roomTV.w - 8) / 2, roomTV.y + 31);

    // Nhãn hướng dẫn Giường Ngủ, PC, Tủ Lạnh & Cửa Ra Phố
    pOutlinedRect(ctx, 208, 104, 90, 22, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛏️ Ngủ [E]", 253, 119);

    pOutlinedRect(ctx, 198, 270, 82, 20, "#dce8f2");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 10.5px 'Chakra Petch', sans-serif";
    ctx.fillText("💻 PC [E]", 239, 284);

    pOutlinedRect(ctx, 696, 114, 98, 22, fridgeLevel > 0 ? "#c8ebd6" : "#e3f2f7");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 10.5px 'Chakra Petch', sans-serif";
    ctx.fillText(fridgeLevel > 0 ? `❄️ Tủ Lv.${fridgeLevel}` : "❄️ Tủ lạnh [E]", 745, 129);

    pOutlinedRect(ctx, homeExit.x, homeExit.y, homeExit.w, homeExit.h, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🚪 Ra phố [E]", 500, 462);

    drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
    drawPlayerNameLabel(player.x, player.y);

    pOutlinedRect(ctx, 14, canvas.height - 38, 630, 30, "#ecd3ab");
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("💡 Xem PC quản lý quán • Nâng cấp Tủ lạnh giữ nguyên liệu lâu hư • Tối về Giường [E] đi ngủ.", 26, canvas.height - 19);

    if (vipRushTimer > 0) {
        const secsLeft = Math.ceil(vipRushTimer / 60);
        pOutlinedRect(ctx, 14, activeDeliveryOrder ? 152 : 118, 260, 26, "#f0b643");
        ctx.fillStyle = "#7b241c";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`🔥 GIỜ CAO ĐIỂM VIP (${secsLeft}s · Khách x1.6)`, 24, (activeDeliveryOrder ? 152 : 118) + 17);
    }

    drawInteractionBanner();
    drawGuideCompassAndBeacon();
    drawMinimalHUD("Nhà riêng | Hẻm 54");
    drawToastOverlay();
    drawMapModal();
    drawNPCSchedule();
    drawWallCalendar();
    drawTVModal();
    drawPCModal();
    drawSleepSummaryModal();
}

function upgradeHomeFridge() {
    const next = FRIDGE_UPGRADES[fridgeLevel + 1];
    if (!next) {
        showToast("❄️ Tủ lạnh đã đạt cấp tối đa (+2 ngày bảo quản)!");
        return;
    }
    if (playerStats.money < next.price) {
        GameAudio?.playError();
        showToast(`⚠️ Cần ${moneyLabel(next.price)} để nâng cấp ${next.name}!`);
        return;
    }
    playerStats.money -= next.price;
    fridgeLevel = next.level;
    // Gia hạn thêm +1 ngày cho toàn bộ lô nguyên liệu đang trữ trong kho
    for (const k of ['coffee', 'milk', 'fruit']) {
        for (const batch of (inventoryBatches[k] || [])) {
            batch.daysLeft = (batch.daysLeft || 1) + 1;
        }
    }
    GameAudio?.playUnlock();
    addScreenPopup(110, 56, `-${next.price.toLocaleString('vi-VN')}đ`, "#e74c3c");
    showToast(`❄️ Đã nâng cấp ${next.name}! Nguyên liệu giữ tươi thêm +${next.bonusDays} ngày.`, 240);
}

function handlePCModalClick(mx, my) {
    if (mx >= 776 && mx <= 848 && my >= 96 && my <= 128) {
        showPCModal = false;
        GameAudio?.playModalClose();
        return;
    }
    if (mx >= 170 && mx <= 490 && my >= 134 && my <= 170) {
        pcModalTab = 'finance';
        GameAudio?.playClick();
        return;
    }
    if (mx >= 510 && mx <= 830 && my >= 134 && my <= 170) {
        pcModalTab = 'fridge';
        GameAudio?.playClick();
        return;
    }
    if (pcModalTab === 'fridge' && mx >= 240 && mx <= 760 && my >= 452 && my <= 504) {
        upgradeHomeFridge();
        return;
    }
    if (mx < 140 || mx > 860 || my < 80 || my > 565) {
        showPCModal = false;
        GameAudio?.playModalClose();
    }
}

function drawPCModal() {
    if (!showPCModal) return;
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(18, 14, 16, 0.80)");
    drawStandardModalFrame({
        x: 140,
        y: 80,
        w: 720,
        h: 485,
        title: "💻 MÁY TÍNH CHỦ QUÁN · SỔ KẾ TOÁN & KHO LẠNH",
        titleAlign: 'left',
        titleSize: 16,
        closeButton: false
    });

    pOutlinedRect(ctx, 776, 96, 72, 32, "#c84b31");
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText("Đóng [Q]", 812, 116);

    // 2 Tab chuyển nhanh
    pOutlinedRect(ctx, 170, 134, 320, 36, pcModalTab === 'finance' ? "#f0b643" : "#ecd3ab");
    pOutlinedRect(ctx, 510, 134, 320, 36, pcModalTab === 'fridge' ? "#f0b643" : "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    ctx.fillText("1. 📊 Sổ Kế Toán & Chuỗi Quán", 330, 157);
    ctx.fillText("2. ❄️ Kho Nguyên Liệu & Tủ Lạnh", 670, 157);

    if (pcModalTab === 'finance') {
        const wNext = getWeatherInfo(playerStats.tomorrowWeather);
        const daysRent = getDaysUntilNextRent();
        const bizList = Object.values(businesses);

        // Thẻ tổng quan tài chính hôm nay
        pOutlinedRect(ctx, 170, 182, 320, 112, "#f3e4c4");
        ctx.textAlign = "left";
        ctx.fillStyle = "#8b3a2b";
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        ctx.fillText(`📅 NGÀY ${playerStats.dayOfYear}/100 · NĂM ${playerStats.year}`, 186, 206);
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
        ctx.fillText(`• Hôm nay: ${dailyReport.cupsSold} ly (+${moneyLabel(dailyReport.revenue)})`, 186, 228);
        const bRank = getBaristaRank();
        ctx.fillText(`• Barista Lv.${bRank.level}: ${bRank.name} (${totalCupsSold} ly)`, 186, 250, 294);
        ctx.fillText(`• Món Signature: ${unlockedSignatures.size}/3 · Mai: ${wNext.icon} ${wNext.name}`, 186, 272, 294);

        // Thẻ tín dụng & danh tiếng
        pOutlinedRect(ctx, 510, 182, 320, 112, "#e8f0ec");
        ctx.fillStyle = "#2b5c6b";
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        ctx.fillText("🏦 TÍN DỤNG & DANH TIẾNG", 526, 206);
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
        ctx.fillText(`• Danh tiếng TP: ${cityReputation}/100  |  Uy tín quán: ${customerReputation}/100`, 526, 230, 290);
        ctx.fillText(bankDebt > 0 ? `• Nợ VietBank: ${moneyLabel(bankDebt)} (${moneyLabel(dailyLoanPayment)}/ngày)` : "• Nợ VietBank: Không nợ (Sạch)", 526, 252, 290);
        ctx.fillText(`• Điểm tín dụng: ${creditScore}  |  Kỳ thuê tiếp: còn ${daysRent} ngày`, 526, 274, 290);

        // Danh sách chuỗi quán đang sở hữu
        pOutlinedRect(ctx, 170, 306, 660, 230, "#fffdf6");
        ctx.fillStyle = "#5c382c";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText(`🏪 CHUỖI MẶT BẰNG ĐANG THUÊ (${bizList.length})`, 186, 330);

        if (bizList.length === 0) {
            ctx.textAlign = "center";
            ctx.fillStyle = "#7a6354";
            ctx.font = "13.5px 'Chakra Petch', sans-serif";
            ctx.fillText("Chưa thuê mặt bằng nào. Hãy bán cà phê tích vốn & tăng Danh tiếng TP!", 500, 412);
            ctx.fillText("Gợi ý: Mặt bằng Hẻm 54 chỉ cần 4.500.000đ và 0 danh tiếng để khởi đầu.", 500, 440);
        } else {
            bizList.slice(0, 5).forEach((b, idx) => {
                const ry = 342 + idx * 36;
                const zName = GAME_CONFIG.ZONES[b.zone]?.name || b.zone;
                const rentDue = getBusinessRentDue(b);
                pOutlinedRect(ctx, 184, ry, 632, 31, b.rentOverdue ? "#fadbd8" : "#f7ecd5");
                ctx.textAlign = "left";
                ctx.fillStyle = b.rentOverdue ? "#922b21" : PAL.OUTLINE;
                ctx.font = "bold 12px 'Chakra Petch', sans-serif";
                const status = b.pending ? "⏳ Chờ ký" : b.rentOverdue ? `⚠️ Nợ ${moneyLabel(b.overdueAmount)}` : (b.hasStaff ? "👨‍🍳 Có NV" : "🟢 Đang mở");
                ctx.fillText(`${b.type.name} · ${b.rental.name} (${zName})`, 196, ry + 20, 340);
                ctx.textAlign = "right";
                ctx.fillText(`Thuê: ${moneyLabel(rentDue)} · ${status}`, 804, ry + 20, 260);
            });
            if (bizList.length > 5) {
                ctx.textAlign = "center";
                ctx.fillStyle = "#6e4736";
                ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
                ctx.fillText(`... và ${bizList.length - 5} mặt bằng khác`, 500, 528);
            }
        }
    } else {
        // Tab 2: Chi tiết lô nguyên liệu & Nâng cấp Tủ Lạnh
        const ingMeta = [
            { id: 'coffee', icon: '🫘', name: 'Hạt Cà Phê Rang Mộc' },
            { id: 'milk', icon: '🥫', name: 'Sữa Đặc Ngọt Ngào' },
            { id: 'fruit', icon: '🍊', name: 'Trái Cây & Cam Sả Tươi' }
        ];
        ingMeta.forEach((meta, idx) => {
            const ry = 184 + idx * 66;
            const batches = (inventoryBatches[meta.id] || []).filter((b) => b.qty > 0).sort((a, b) => a.daysLeft - b.daysLeft);
            const total = inventory[meta.id] || 0;
            const batchText = batches.length
                ? batches.map((b) => `${b.qty} phần (còn ${b.daysLeft} ngày)`).join('  ·  ')
                : 'Kho đang trống — ghé Tiệm Cô Ba mua thêm';
            const urgent = batches.some((b) => b.daysLeft <= 1);
            pOutlinedRect(ctx, 170, ry, 660, 56, urgent ? "#fdebd0" : "#f6ead1");
            ctx.textAlign = "left";
            ctx.fillStyle = PAL.OUTLINE;
            ctx.font = "bold 14.5px 'Chakra Petch', sans-serif";
            ctx.fillText(`${meta.icon} ${meta.name} — Tổng: ${total} phần`, 188, ry + 23);
            ctx.textAlign = "right";
            ctx.fillStyle = "#2e6b3e";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.fillText(`Hạn mua mới: ${getIngredientShelfLife(meta.id)} ngày`, 812, ry + 23);
            ctx.textAlign = "left";
            ctx.fillStyle = urgent ? "#b03a2e" : "#5c4033";
            ctx.font = "12.5px 'Chakra Petch', sans-serif";
            ctx.fillText(`Chi tiết lô: ${batchText}`, 188, ry + 45, 624);
        });

        // Khung trạng thái Tủ lạnh & nút nâng cấp
        const curFridge = FRIDGE_UPGRADES[fridgeLevel] || FRIDGE_UPGRADES[0];
        const nextFridge = FRIDGE_UPGRADES[fridgeLevel + 1];
        pOutlinedRect(ctx, 170, 388, 660, 148, "#e3f2f7");
        ctx.textAlign = "center";
        ctx.fillStyle = "#1b4965";
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.fillText(`❄️ ${curFridge.name} (Cấp ${fridgeLevel}/2 · +${curFridge.bonusDays} ngày bảo quản)`, 500, 416);
        ctx.fillStyle = "#4a3a35";
        ctx.font = "13px 'Chakra Petch', sans-serif";
        ctx.fillText(curFridge.desc, 500, 439);

        if (nextFridge) {
            const canBuy = playerStats.money >= nextFridge.price;
            pOutlinedRect(ctx, 240, 452, 520, 52, canBuy ? "#4f8a46" : "#95a5a6");
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14.5px 'Chakra Petch', sans-serif";
            ctx.fillText(`⬆️ Nâng cấp: ${nextFridge.name} — ${moneyLabel(nextFridge.price)}`, 500, 476);
            ctx.font = "11.5px 'Chakra Petch', sans-serif";
            ctx.fillText(nextFridge.desc + " (+1 ngày cho cả đồ đang trữ)", 500, 495);
        } else {
            pOutlinedRect(ctx, 280, 458, 440, 42, "#aaca8c");
            ctx.fillStyle = "#1f4d2b";
            ctx.font = "bold 14px 'Chakra Petch', sans-serif";
            ctx.fillText("✅ Tủ lạnh đã đạt cấp tối đa (+2 ngày tươi)!", 500, 484);
        }
    }
}

function drawTVModal() {
    if (!showTVModal) return;
    const todayW = getWeatherInfo(playerStats.weather);
    const tomorrowW = getWeatherInfo(playerStats.tomorrowWeather);
    const todayFest = getTodayFestival();
    const nextFest = yearFestivals
        .filter((f) => f.day > playerStats.dayOfYear)
        .sort((a, b) => a.day - b.day)[0];

    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(18, 14, 16, 0.78)");
    drawStandardModalFrame({
        x: 200,
        y: 120,
        w: 600,
        h: 400,
        title: "📺 BẢN TIN DỰ BÁO THỜI TIẾT SÀI GÒN",
        titleSize: 17,
        closeButton: false
    });

    // Khung Hôm nay
    pOutlinedRect(ctx, 238, 208, 250, 160, "#f3e4c4");
    ctx.fillStyle = "#8b3a2b";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`HÔM NAY (Ngày ${playerStats.dayOfYear}/100)`, 363, 232);
    ctx.font = "bold 26px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`${todayW.icon} ${todayW.name}`, 363, 270);
    ctx.font = "12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#4a3a35";
    ctx.fillText(todayW.desc, 363, 305, 226);

    // Khung Ngày mai
    pOutlinedRect(ctx, 512, 208, 250, 160, "#e6f2ef");
    ctx.fillStyle = "#2b5c6b";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("DỰ BÁO NGÀY MAI", 637, 232);
    ctx.font = "bold 26px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`${tomorrowW.icon} ${tomorrowW.name}`, 637, 270);
    ctx.font = "12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#4a3a35";
    const tip = tomorrowW.id === 'HOT'
        ? "Mẹo: Trời oi bức, nhớ trữ Sữa pha Bạc Xỉu!"
        : (tomorrowW.id === 'RAIN' || tomorrowW.id === 'STORM')
        ? "Mẹo: Dễ mưa to, ưu tiên bán trong quán có mái che."
        : "Mẹo: Trời đẹp, đẩy xe ra Công Viên rất dễ đông khách!";
    ctx.fillText(tip, 637, 305, 226);

    // Tin tức lễ hội nhanh
    pOutlinedRect(ctx, 238, 384, 524, 52, "#fcecd0");
    ctx.fillStyle = "#6a4234";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    const festMsg = todayFest
        ? `🎉 Hôm nay có lễ hội [${todayFest.name}] tại Công Viên (09:00–21:00)!`
        : nextFest
        ? `📅 Sự kiện sắp tới: [${nextFest.name}] vào Ngày ${nextFest.day} (còn ${nextFest.day - playerStats.dayOfYear} ngày).`
        : "📅 Hỏi thăm Chú Tư Thành ngoài hẻm để cập nhật tin tức khu phố!";
    ctx.fillText(festMsg, 500, 415, 500);

    pOutlinedRect(ctx, 410, 450, 180, 40, "#547d4e");
    ctx.fillStyle = "#fff6e4";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG TIVI [Q / Click]", 500, 475);
}

function drawBikeFrame(c, x, y, color) {
    pRect(c, x - 2, y + 24, 38, 5, "rgba(0,0,0,0.32)");
    pOutlinedRect(c, x, y + 12, 13, 13, "#262626");
    pRect(c, x + 3, y + 15, 7, 7, "#dce6e8");
    pOutlinedRect(c, x + 21, y + 12, 13, 13, "#262626");
    pRect(c, x + 24, y + 15, 7, 7, "#dce6e8");
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x + 6, y + 18);
    c.lineTo(x + 16, y + 8);
    c.lineTo(x + 27, y + 18);
    c.lineTo(x + 14, y + 18);
    c.closePath();
    c.stroke();

}

function drawBicycleRider(cy) {
    const x = Math.round(cy.x);
    const y = Math.round(cy.y);
    const dir = cy.dir;
    drawBikeFrame(ctx, x, y, cy.frameColor);
    const riderCfg = {
        genderIndex: 0,
        outfitIndex: 0,
        outfits: [{ color: cy.shirtColor, shadow: "#59544f", shorts: "#2e3136" }],
        accessoryIndex: 0,
        accessories: [{ type: "cap" }]
    };
    drawBitmapCharacter(x + 6, y - 14, riderCfg, dir > 0 ? 'right' : 'left', 0, false, 1.05, true);
}

function drawBreezeSeasonDecorations() {
    const season = getNPCSchedulePhase();
    const colors = [["#ec786e", "#f2ca69"], ["#f0b643", "#6cb1cd"],
        ["#d9764e", "#e5ad61"], ["#83b4c5", "#f8dcaa"]][season];
    for (let index = 0; index < 9; index++) {
        const x = 165 + index * 203;
        const sway = Math.round(Math.sin(tickCount * 0.035 + index) * 10);
        const color = colors[index % colors.length];
        pRect(ctx, x, 787, 4, 29, "#574639");
        if (season === 2) {
            pRect(ctx, x, 775, 180, 2, "#725048");
            for (let offset = 12; offset < 170; offset += 33) {
                pRect(ctx, x + offset, 777, 1, 10, "#725048");
                pOutlinedRect(ctx, x + offset - 4, 785 + sway * 0.18, 11, 15, color);
            }
            continue;
        }
        const airY = 742 - (index % 3) * 16 + sway;
        ctx.strokeStyle = "#625651";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, 790);
        ctx.lineTo(x + 30 + sway, airY + 17);
        ctx.stroke();
        if (season === 1) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x + 30 + sway, airY - 16);
            ctx.lineTo(x + 46 + sway, airY);
            ctx.lineTo(x + 30 + sway, airY + 18);
            ctx.lineTo(x + 15 + sway, airY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (season === 0) {
            pOutlinedRect(ctx, x + 19 + sway, airY - 4, 24, 13, color);
            pRect(ctx, x + 39 + sway, airY + 5, 11, 4, "#fff0bd");
        } else {
            pOutlinedRect(ctx, x + 22 + sway, airY - 9, 17, 23, color);
            pRect(ctx, x + 29 + sway, airY - 6, 2, 17, "#fff0bd");
        }
    }
}

function drawVungTauMarketKeepers() {
    const vendors = [
        { x: 335, y: 903, shirt: '#d97559', hair: '#31251f', gender: 1, name: 'Cô bán cá' },
        { x: 594, y: 989, shirt: '#658d70', hair: '#29221d', gender: 0, name: 'Chú bán hàu' },
        { x: 858, y: 903, shirt: '#e0a34c', hair: '#33231a', gender: 1, name: 'Dì bán tôm' },
        { x: 1128, y: 989, shirt: '#4f8290', hair: '#342822', gender: 0, name: 'Bác bán cá' },
        { x: 1426, y: 903, shirt: '#b85e55', hair: '#30231d', gender: 1, name: 'Cô bán cá khô' },
        { x: 1685, y: 989, shirt: '#778c64', hair: '#392b20', gender: 0, name: 'Chú chở đá' }
    ];
    for (const vendor of vendors) {
        const config = {
            genderIndex: vendor.gender,
            look: [1.05, 1.05, 'crop', vendor.hair, 1, 'tie', 'shirt', vendor.shirt, '#43534d'],
            outfitIndex: 0,
            outfits: [{ color: vendor.shirt, shadow: '#554b42', shorts: '#343a3c' }],
            accessoryIndex: 0,
            accessories: [{ type: 'cap' }]
        };
        drawBitmapCharacter(vendor.x, vendor.y, config, 'down', 0, false, 1.08);
        ctx.font = "bold 9px 'Chakra Petch', sans-serif";
        ctx.textAlign = 'center';
        const tagWidth = ctx.measureText(vendor.name).width + 10;
        pOutlinedRect(ctx, vendor.x + 18 - tagWidth / 2, vendor.y - 14, tagWidth, 15, '#fff0c8');
        ctx.fillStyle = '#5c4130';
        ctx.fillText(vendor.name, vendor.x + 18, vendor.y - 3);
    }
}

function drawRegionalAtmosphereInWorld() {
    // Điểm bắt sáng dịch chuyển nhẹ trên tán cây, giúp nền tĩnh có cảm giác đung đưa.
    const treeCanopies = {
        HOME_STREET: [[150, 360, 1.1], [670, 370, 1.05], [1760, 360, 1.15], [380, 950, 1.2], [1420, 960, 1.2]],
        BETTER_STREET: [[640, 360, 1.15], [1160, 360, 1.15], [815, 940, 1.25]],
        DOWNTOWN: [[490, 940, 1.2], [1680, 940, 1.2]],
        OFFICE_DISTRICT: [[520, 940, 1.2]],
        PARK: [[180, 360, 1.2], [740, 360, 1.2], [1180, 360, 1.2], [1740, 360, 1.2], [1300, 940, 1.25], [1620, 940, 1.25]],
        ELDERLY_AREA: [[320, 860, 1.25], [740, 860, 1.25]],
        VILLAS: [[1880, 140, 1.15], [1880, 370, 1.15]]
    };
    const canopies = treeCanopies[currentZone] || [];
    canopies.forEach(([x, y, scale], index) => {
        const sway = Math.round(Math.sin(tickCount * 0.035 + index * 1.7) * 3);
        // Bóng tán cây xê dịch nhẹ trên nền, tạo lớp chiều sâu chuyển động.
        pRect(ctx, x - 29 * scale + sway, y + 7 * scale, 58 * scale, 14 * scale, 'rgba(35, 42, 30, 0.08)');
        const leafX = x - 20 * scale + sway;
        const leafY = y - 100 * scale + (index % 2) * 8;
        pRect(ctx, leafX, leafY, 18 * scale, 4 * scale, 'rgba(190, 222, 112, 0.28)');
        pRect(ctx, leafX + 27 * scale, leafY + 19 * scale, 12 * scale, 3 * scale, 'rgba(225, 231, 145, 0.22)');
    });

    // Hoa giấy rơi theo gió ở phố cổ và công viên.
    if (currentZone === 'ELDERLY_AREA' || currentZone === 'PARK' || currentZone === 'HOME_STREET') {
        const blossoms = currentZone === 'ELDERLY_AREA'
            ? [[320, 860], [740, 860]]
            : currentZone === 'PARK' ? [[180, 360], [740, 360], [1180, 360], [1740, 360]] : [[670, 370]];
        blossoms.forEach(([x, y], treeIndex) => {
            for (let i = 0; i < 4; i++) {
                const phase = (tickCount * 0.45 + i * 17 + treeIndex * 9) % 92;
                const px = x + Math.round(Math.sin(phase * 0.08 + i) * (16 + phase * 0.35));
                const py = y - 75 + phase;
                pRect(ctx, px, py, 3, 3, currentZone === 'ELDERLY_AREA' ? '#e9a6bd' : '#f4c0cf');
                if (i % 2 === 0) pRect(ctx, px + 3, py + 1, 2, 2, 'rgba(255, 232, 210, 0.78)');
            }
        });
    }

    // Đom đóm lập lòe ở các khoảng xanh khi chiều xuống.
    if ((currentZone === 'PARK' || currentZone === 'VILLAS' || currentZone === 'DALAT_PINE') && playerStats.hour >= 17) {
        for (let i = 0; i < 13; i++) {
            const phase = tickCount * 0.04 + i * 1.9;
            const x = 90 + (i * 149) % 1810 + Math.round(Math.sin(phase) * 8);
            const y = 500 + (i * 83) % 530 + Math.round(Math.cos(phase * 0.8) * 7);
            const glow = 0.28 + (Math.sin(phase * 1.7) + 1) * 0.2;
            ctx.fillStyle = `rgba(255, 231, 137, ${glow.toFixed(2)})`;
            ctx.fillRect(x - 2, y - 2, 5, 5);
            ctx.fillStyle = `rgba(255, 245, 194, ${(glow * 0.9).toFixed(2)})`;
            ctx.fillRect(x, y, 2, 2);
        }
    }

    // Gợn sáng trên sông và kênh, chuyển động riêng theo nhịp nước miền Tây.
    if (currentZone === 'MEKONG_QUAY' || currentZone === 'MEKONG_FLOATING' || currentZone === 'MEKONG_CRAFT') {
        const waterTop = currentZone === 'MEKONG_FLOATING' ? 801 : currentZone === 'MEKONG_QUAY' ? 1010 : 1010;
        for (let i = 0; i < 18; i++) {
            const x = (i * 127 + tickCount * (i % 2 ? 0.8 : -0.45) + WORLD_W * 2) % WORLD_W;
            const y = waterTop + 18 + (i * 37) % 220;
            const width = 9 + (i % 4) * 4;
            pRect(ctx, Math.round(x), y, width, 2, i % 3 === 0 ? 'rgba(231, 245, 208, 0.52)' : 'rgba(173, 220, 200, 0.38)');
        }
    }

    // Ánh nắng lướt qua kính nhà kính Đà Lạt.
    if (currentZone === 'DALAT_GREENHOUSE') {
        const glintX = Math.round(120 + (tickCount * 1.7) % 1680);
        pRect(ctx, glintX, 733, 30, 3, 'rgba(255, 255, 225, 0.48)');
        pRect(ctx, glintX + 8, 741, 14, 2, 'rgba(255, 255, 255, 0.34)');
    }
}

function drawZoneAmbientEffectsInWorld() {
    drawRegionalAtmosphereInWorld();
    if (currentZone.startsWith('VUNGTAU_')) {
        const phase = tickCount * 0.035;
        for (let x = -40; x < WORLD_W; x += 96) {
            const y = 1118 + Math.round(Math.sin(phase + x * 0.008) * 6);
            pRect(ctx, x, y, 85, 5, 'rgba(247,252,224,0.85)');
            pRect(ctx, x + 24, y + 50, 46, 3, 'rgba(213,246,226,0.55)');
        }
        if (currentZone === 'VUNGTAU_LIGHTHOUSE' && playerStats.hour >= 18) {
            const pulse = 0.18 + (Math.sin(tickCount * 0.06) + 1) * 0.07;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#ffe8a5';
            ctx.beginPath();
            ctx.moveTo(1150, 666); ctx.lineTo(15, 554); ctx.lineTo(15, 612); ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(1150, 666); ctx.lineTo(1990, 730); ctx.lineTo(1990, 786); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }

    if (currentZone === 'BREEZE_AREA') {
        const waveOffset = Math.sin(tickCount * 0.05) * 10;
        pRect(ctx, 0, 836 + waveOffset * 0.4, WORLD_W, 5, "rgba(255, 255, 255, 0.75)");
        drawBreezeSeasonDecorations();
        breezeCyclists.forEach((cy) => drawBicycleRider(cy));
    } else if (currentZone === 'VUNGTAU_FISHING') {
        drawVungTauMarketKeepers();
    } else if (currentZone === 'ELDERLY_AREA') {
        const elder1 = {
            genderIndex: 0, outfitIndex: 0,
            outfits: [{ color: "#d4c3a3", shadow: "#a69372", shorts: "#4a3b2c" }],
            accessoryIndex: 0, accessories: [{ type: "hat" }]
        };
        const elder2 = {
            genderIndex: 0, outfitIndex: 0,
            outfits: [{ color: "#8c6d53", shadow: "#5c4430", shorts: "#332920" }],
            accessoryIndex: 0, accessories: [{ type: "none" }]
        };
        drawBitmapCharacter(355, 895, elder1, 'right', 0, false, 1.35);
        drawBitmapCharacter(465, 895, elder2, 'left', 0, false, 1.35);
        drawBitmapCharacter(545, 895, elder2, 'right', 0, false, 1.35);
        drawBitmapCharacter(655, 895, elder1, 'left', 0, false, 1.35);
    } else {
        if (currentZone === 'HOME_STREET' || currentZone === 'BETTER_STREET') {
            drawVendorOnSidewalk(vendorNPC.x, vendorNPC.y);
        }
        if (currentZone !== 'PARK') streetMotorbikes.forEach((b) => drawMovingBikeTopDown(b));
    }

    // Vũng nước nhỏ phản chiếu đèn và trời âm u trên đường ở hai khu phố chính.
    if ((currentZone === 'HOME_STREET' || currentZone === 'BETTER_STREET') &&
        (playerStats.weather === 'RAIN' || playerStats.weather === 'STORM')) {
        const isNight = playerStats.hour >= 18;
        const shimmer = Math.floor(tickCount / 9) % 3;
        const puddles = [
            [356, 548, 42, 9], [782, 632, 56, 10], [1010, 555, 38, 8],
            [1328, 646, 48, 9], [1718, 568, 44, 8]
        ];
        puddles.forEach(([x, y, width, height], index) => {
            pRect(ctx, x, y, width, height, 'rgba(31, 47, 57, 0.42)');
            pRect(ctx, x + 4, y + 2, width - 8, height - 4,
                isNight ? 'rgba(232, 177, 91, 0.24)' : 'rgba(173, 208, 216, 0.25)');
            const glintX = x + 7 + ((shimmer + index * 11) % Math.max(1, width - 14));
            pRect(ctx, glintX, y + 2, 5, 2,
                isNight ? 'rgba(255, 224, 153, 0.75)' : 'rgba(239, 249, 246, 0.72)');
        });
    }

    // Khách đi dạo và cư dân có lịch hẹn
    drawStreetCustomersInWorld();
    drawStoryNPCsInWorld();

    // Quầng sáng đèn đường ấm áp khi trời tối (>= 18:00)
    if (playerStats.hour >= 18.0) {
        [220, 640, 1140, 1620].forEach((lx) => {
            const pulse = 0.13 + (Math.sin(tickCount * 0.035 + lx) + 1) * 0.025;
            // Quầng sáng bậc pixel loang từ chân đèn xuống vỉa hè.
            for (const lampY of [455, 670]) {
                ctx.fillStyle = `rgba(255, 202, 112, ${pulse.toFixed(3)})`;
                ctx.fillRect(lx - 28, lampY + 3, 56, 12);
                ctx.fillStyle = `rgba(255, 202, 112, ${(pulse * 0.72).toFixed(3)})`;
                ctx.fillRect(lx - 40, lampY + 15, 80, 13);
                ctx.fillStyle = `rgba(255, 202, 112, ${(pulse * 0.42).toFixed(3)})`;
                ctx.fillRect(lx - 48, lampY + 28, 96, 20);
                ctx.fillStyle = `rgba(255, 202, 112, ${(pulse * 0.2).toFixed(3)})`;
                ctx.fillRect(lx - 34, lampY + 48, 68, 13);
            }
        });
    }

}

function drawFloatingTextsInWorld() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= 0.6 * dt;
        ft.life -= dt;
        ctx.fillStyle = ft.color;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y);
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawToastOverlay() {
    if (toastTimer > 0) {
        toastTimer -= dt;
        const hasBanner = !isAnyModalOpen() && (nearbyInteractable || nearbyRental);
        const toastY = hasBanner ? 120 : 76;
        const tw = Math.min(940, Math.max(420, toastMessage.length * 9.6 + 56));
        pOutlinedRect(ctx, canvas.width / 2 - tw / 2, toastY, tw, 42, "#2b1d16");
        pRect(ctx, canvas.width / 2 - tw / 2 + 2, toastY + 2, tw - 4, 38, "#fff3d6");
        ctx.fillStyle = "#c84b31";
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(toastMessage, canvas.width / 2, toastY + 27, tw - 26);
    }
}

function drawMarketInspectorInWorld() {
    if (!marketInspector.active || marketInspector.zone !== currentZone) return;
    const cfg = {
        genderIndex: 0,
        look: [1.14, 1.08, 'crop', '#262930', 1, 'tie', 'suit', '#2f4f6f', '#1c3247'],
        outfitIndex: 0,
        outfits: [{ color: '#2f4f6f', shadow: '#1c3247', shorts: '#1e2730' }],
        accessoryIndex: 0,
        accessories: [{ type: 'cap' }]
    };
    drawBitmapCharacter(marketInspector.x, marketInspector.y, cfg, marketInspector.dir > 0 ? 'right' : 'left', marketInspector.animFrame, true, 1.45);
    ctx.font = "bold 10.5px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    const tag = "👮 QUẢN LÝ THỊ TRƯỜNG";
    const width = ctx.measureText(tag).width + 12;
    pOutlinedRect(ctx, marketInspector.x + 18 - width / 2, marketInspector.y - 18, width, 16, "#ffd6d6");
    ctx.fillStyle = "#96281b";
    ctx.fillText(tag, marketInspector.x + 18, marketInspector.y - 6);
}

function drawCoffeeCartInWorld() {
    if (coffeeCart.zone !== currentZone) {
        drawMarketInspectorInWorld();
        return;
    }
    const cx = Math.round(coffeeCart.x);
    const cy = Math.round(coffeeCart.y);

    pRect(ctx, cx - 4, cy + 48, 96, 12, "rgba(43, 29, 22, 0.38)");
    pOutlinedRect(ctx, cx, cy, 88, 50, "#b8bfc4");
    pOutlinedRect(ctx, cx, cy - 34, 88, 36, "rgba(220, 235, 242, 0.78)");
    if (!coffeeCart.isOpen && !coffeeCart.isPushed) {
        pRect(ctx, cx + 2, cy - 32, 84, 32, "#5c4a42");
        for (let sy = cy - 26; sy < cy - 2; sy += 6) {
            pRect(ctx, cx + 4, sy, 80, 2, "#3a2e28");
        }
    }
    if (coffeeCart.seized) {
        pRect(ctx, cx - 2, cy - 10, 92, 8, "#f1c40f");
        for (let sx = cx; sx < cx + 84; sx += 14) {
            pRect(ctx, sx, cy - 10, 7, 8, "#c0392b");
        }
    }
    drawStripedAwning(ctx, cx - 6, cy - 50, 100, 20, "#c84b31", "#f0b643");
    pOutlinedRect(ctx, cx + 8, cy + 42, 16, 16, "#262626");
    pOutlinedRect(ctx, cx + 62, cy + 42, 16, 16, "#262626");

    // Hơi cà phê bốc lên thành các cụm pixel nhỏ khi xe đang mở bán.
    if (coffeeCart.isOpen && !coffeeCart.isPushed && !coffeeCart.seized) {
        for (let i = 0; i < 2; i++) {
            const phase = (Math.floor(tickCount / 7) + i * 5) % 10;
            const vaporX = cx + 26 + i * 32 + (phase % 3) * 2;
            const vaporY = cy - 54 - phase * 3;
            const alpha = 0.48 - phase * 0.035;
            ctx.fillStyle = `rgba(255, 245, 220, ${alpha.toFixed(2)})`;
            ctx.fillRect(vaporX, vaporY, 5, 2);
            ctx.fillRect(vaporX + (phase % 2 ? 2 : -2), vaporY - 4, 4, 2);
            if (phase < 6) ctx.fillRect(vaporX - 2, vaporY - 8, 3, 2);
        }
    }

    if (coffeeCart.umbrella) {
        pRect(ctx, cx + 42, cy - 84, 4, 36, "#6f4e37");
        pOutlinedRect(ctx, cx - 18, cy - 96, 124, 18, "#2e7d32");
        pRect(ctx, cx - 12, cy - 94, 112, 6, "#f0b643");
    }
    if (coffeeCart.seating && !coffeeCart.isPushed) {
        // Bàn nhỏ & 2 ghế cóc Sài Gòn bên cạnh xe khi đậu bán
        pOutlinedRect(ctx, cx + 96, cy + 28, 22, 16, "#b37c56");
        pOutlinedRect(ctx, cx + 92, cy + 46, 12, 10, "#2980b9");
        pOutlinedRect(ctx, cx + 110, cy + 46, 12, 10, "#c0392b");
    }
    ctx.fillStyle = coffeeCart.seized ? "#c0392b" : ((!coffeeCart.isOpen && !coffeeCart.isPushed) ? "#6d5b53" : PAL.SIGN_RED);
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
        coffeeCart.seized
            ? "🚫 TẠM GIỮ (2TR)"
            : (coffeeCart.isPushed ? "🛒 ĐANG ĐẨY" : (coffeeCart.isOpen ? "☕ XE CÀ PHÊ 5AM" : "🔒 ĐÃ ĐÓNG CỬA")),
        cx + 44, cy + 30
    );
    drawMarketInspectorInWorld();
}

function drawScreenPopups() {
    for (let i = screenPopups.length - 1; i >= 0; i--) {
        const sp = screenPopups[i];
        sp.y -= 0.65 * dt;
        sp.life -= dt;
        const alpha = Math.min(1, sp.life / 25);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        // Viền tối giúp chữ nổi rõ ngay cả trên bảng Modal
        ctx.fillStyle = "#1c1410";
        ctx.fillText(sp.text, sp.x + 2, sp.y + 2);
        ctx.fillStyle = sp.color;
        ctx.fillText(sp.text, sp.x, sp.y);
        ctx.restore();
        if (sp.life <= 0) screenPopups.splice(i, 1);
    }
}

function getGarageOptions() {
    return [null, ...showroomVehicles.filter((vehicle) => ownedVehicles.has(vehicle.id))];
}

function handleGarageClick(x, y) {
    if (x >= 688 && x <= 765 && y >= 114 && y <= 152) {
        closeAllModals();
        return;
    }
    if (x < 267 || x > 733 || y < 190) return;
    const offset = y - 190;
    const options = getGarageOptions();
    const index = Math.floor(offset / 51);
    if (index >= options.length || offset % 51 > 43) return;
    const vehicle = options[index];
    if (vehicle && (currentZone === 'PARK' || coffeeCart.isPushed || ridingBicycle)) {
        showToast(currentZone === 'PARK' ? "Công Viên dành cho người đi bộ." :
            "Đậu xe cà phê hoặc trả xe thuê trước khi chạy.");
        return;
    }
    activeVehicle = vehicle;
    if (vehicle?.id === 'bike') GameAudio?.playBikeBell(0.2);
    else if (vehicle) GameAudio?.playHorn(0, 0.16);
    else GameAudio?.playClick();
    closeAllModals();
}

function drawGarage() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20,14,10,0.76)");
    drawStandardModalFrame({
        x: 236,
        y: 105,
        w: 528,
        h: 385,
        title: "🛵 XE CÁ NHÂN",
        titleSize: 18,
        closeButton: false
    });
    pOutlinedRect(ctx, 688, 114, 77, 38, '#c84b31');
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG [Q]", 726, 138);
    getGarageOptions().forEach((vehicle, index) => {
        const y = 190 + index * 51;
        pOutlinedRect(ctx, 267, y, 466, 43, vehicle === activeVehicle ? "#f0b643" : "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        const label = vehicle ? `${vehicle.name} · Tốc độ ×${vehicle.speed}` : "Đi bộ";
        ctx.fillText(label, 500, y + 27);
    });
    if (!ownedVehicles.size) ctx.fillText("Mua xe tại Showroom Siêu Xe ở Trung Tâm Sầm Uất.", 500, 277);
}

function drawOwnedVehicle(vehicle) {
    if (vehicle.id === 'bike') {
        drawBikeFrame(ctx, player.x + 1, player.y + 11, vehicle.color);
        drawBitmapCharacter(player.x + 2, player.y - 13, playerConfig, player.dir, 0, false, 1.35, true);
        return;
    } else if (vehicle.id === 'scooter') {
        drawParkedScooter(ctx, player.x - 5, player.y + 15, vehicle.color, true, 1.3, player.dir === 'left');
        drawBitmapCharacter(player.x + 3, player.y - 10, playerConfig, player.dir, 0, false, 1.3, true);
        return;
    } else {
        const vertical = player.dir === 'up' || player.dir === 'down';
        const reverse = player.dir === 'left' || player.dir === 'up';
        const width = vehicle.id === 'supercar' ? 52 : 46;
        ctx.save();
        ctx.translate(Math.round(player.x + 17), Math.round(player.y + 25));
        if (vertical) ctx.rotate(Math.PI / 2);
        if (reverse) ctx.scale(-1, 1);
        for (const x of [-width / 2 + 6, width / 2 - 14]) {
            pRect(ctx, x, -13, 9, 26, "#29212b");
        }
        pOutlinedRect(ctx, -width / 2, -10, width, 20, vehicle.color);
        pOutlinedRect(ctx, -10, -8, 20, 16, "#546778");
        pRect(ctx, 4, -6, 4, 12, "#a3c6ce");
        pRect(ctx, width / 2 - 4, -7, 3, 4, "#fff1af");
        pRect(ctx, width / 2 - 4, 3, 3, 4, "#fff1af");
        ctx.restore();
        return;
    }
}

function drawStreet() {
    const festival = yearFestivals.find((event) => event.day === playerStats.dayOfYear && event.zone === currentZone);
    const bg = zoneCanvases[currentZone] || zoneCanvases.HOME_STREET;

    // 1. Vẽ thế giới mở 2000x1400 dịch chuyển theo Camera
    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    ctx.drawImage(bg, 0, 0);
    if (currentZone === busTerminal.zone) {
        for (const bus of terminalBuses) drawPassengerBus(bus.x, bus.y, 1);
    }

    if (['MEKONG_FLOATING', 'MEKONG_CRAFT'].includes(currentZone)) {
        const title = currentZone === 'MEKONG_FLOATING' ? 'CHỢ NỔI MIỆT VƯỜN' : 'SẠP LỤA THỦ CÔNG';
        pOutlinedRect(ctx, 900, 850, 230, 100, '#846f4a');
        ctx.fillStyle = '#fff3d6'; ctx.textAlign = 'center'; ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText(title, 1015, 890);
        const used = Object.values(yearTwo.bag).reduce((sum, count) => sum + count, 0);
        ctx.fillText(`BA LÔ ${used}/8`, 1015, 920);
    }
    if (festival) {
        pOutlinedRect(ctx, festivalPlaza.x - 106, festivalPlaza.y - 27, 212, 54, "#f0b643");
        pOutlinedRect(ctx, festivalStall.x - 96, festivalStall.y - 28, 192, 56, "#aaca8c");
        ctx.textAlign = "center";
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.fillText("Hoạt động lễ hội [E]", festivalPlaza.x, festivalPlaza.y + 6);
        ctx.fillText("Quầy cà phê", festivalStall.x, festivalStall.y + 6);
        const colors = ["#e76f51", "#f0b643", "#77a86e"];
        for (const y of [530, 818]) {
            for (let x = 640; x < 1260; x += 140) {
                pRect(ctx, x, y, 120, 2, "#6e4736");
                for (let i = 0; i < 6; i++) {
                    pOutlinedRect(ctx, x + 8 + i * 19, y + 2, 11, 12, colors[i % colors.length]);
                }
            }
        }
    }
    if (weddingAvailable()) {
        pOutlinedRect(ctx, 870, 666, 260, 68, "#fff0e4");
        ctx.fillStyle = "#973e68";
        ctx.textAlign = "center";
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.fillText("💍 Lễ cưới · Cử hành [E]", 1000, 708);
    }
    drawRentalBadgesInWorld();
    if (currentZone === 'HOME_STREET') {
        // Bảng Tin Hẻm 54 (Nhiệm vụ hằng ngày)
        pRect(ctx, alleyBoard.x + 6, alleyBoard.y + 24, 5, 18, "#5d4037");
        pRect(ctx, alleyBoard.x + 27, alleyBoard.y + 24, 5, 18, "#5d4037");
        pOutlinedRect(ctx, alleyBoard.x, alleyBoard.y, alleyBoard.w, 28, "#8d5524");
        pRect(ctx, alleyBoard.x + 4, alleyBoard.y + 4, alleyBoard.w - 8, 20, "#fff3d6");
        pRect(ctx, alleyBoard.x + 7, alleyBoard.y + 8, 10, 6, "#f0b643");
        pRect(ctx, alleyBoard.x + 20, alleyBoard.y + 9, 10, 8, "#a8d5ba");
        const bob = Math.sin(tickCount * 0.12) * 2;
        pOutlinedRect(ctx, alleyBoard.x + 9, alleyBoard.y - 20 + bob, 20, 18, dailyQuest?.completed ? "#547d4e" : "#f0b643");
        ctx.textAlign = "center";
        ctx.fillStyle = dailyQuest?.completed ? "#ffffff" : "#8b1e1e";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(dailyQuest?.completed ? "✓" : "!", alleyBoard.x + 19, alleyBoard.y - 7 + bob);
    }
    drawCoffeeCartInWorld();
    drawZoneAmbientEffectsInWorld();
    if (currentZone === 'DISTRICT_1' && playerStats.hour >= 16 && playerStats.hour < 24) {
        // Khách ngồi ăn tại bàn ngoài trời & người ra vào Quán Nướng
        const bbqDiners = [
            { x: 1532, y: 292, dir: 'down', shirt: '#d35400', shadow: '#873600' },
            { x: 1554, y: 422, dir: 'up', shirt: '#2980b9', shadow: '#1b4f72' },
            { x: 1738, y: 384, dir: 'down', shirt: '#8e44ad', shadow: '#5b2c6f' },
            { x: 1794, y: 292, dir: 'down', shirt: '#27ae60', shadow: '#196f3d' }
        ];
        bbqDiners.forEach((d) => {
            drawBitmapCharacter(d.x, d.y, {
                genderIndex: 0, outfitIndex: 0,
                outfits: [{ color: d.shirt, shadow: d.shadow, shorts: '#2c3e50' }],
                accessoryIndex: 0, accessories: [{ type: 'none' }]
            }, d.dir, 0, false, 1.25, true);
        });
        const t = performance.now() / 1000;
        const walk1Y = 382 + ((Math.sin(t * 1.1) + 1) * 0.5) * 44;
        const walk1Dir = Math.cos(t * 1.1) >= 0 ? 'down' : 'up';
        drawBitmapCharacter(1660, walk1Y, {
            genderIndex: 1, outfitIndex: 0,
            outfits: [{ color: '#e67e22', shadow: '#a04000', shorts: '#34495e' }],
            accessoryIndex: 0, accessories: [{ type: 'none' }]
        }, walk1Dir, Math.floor(tickCount / 10) % 4, true, 1.35);
        const walk2Y = 426 - ((Math.sin(t * 0.85 + 1.8) + 1) * 0.5) * 42;
        const walk2Dir = Math.cos(t * 0.85 + 1.8) >= 0 ? 'up' : 'down';
        drawBitmapCharacter(1692, walk2Y, {
            genderIndex: 0, outfitIndex: 0,
            outfits: [{ color: '#16a085', shadow: '#0e6251', shorts: '#2c3e50' }],
            accessoryIndex: 0, accessories: [{ type: 'none' }]
        }, walk2Dir, Math.floor(tickCount / 10) % 4, true, 1.35);
    }
    for (const shop of shopsByZone[currentZone] || []) {
        if (!shopIsOpen(shop)) continue;
        const left = shop.x + (shop.w - shop.gateW) / 2;
        const gateH = Math.min(54, Math.max(40, shop.h - 102));
        const top = shop.y + shop.h - gateH;
        const isBBQ = shop.name.includes("NƯỚNG");
        const isParty = Boolean(shop.nightlife || isBBQ);
        const beat = Math.floor(performance.now() / (shop.nightlife ? 180 : 250));
        const palette = shop.nightlife
            ? ['#ff2e93', '#00e5ff', '#ffe600', '#b84dff']
            : ['#ff5722', '#ff9800', '#ffd54f', '#ff3d00'];
        const light = isParty ? palette[beat % palette.length] : (shop.food ? "#f0a257" : "#dfc37b");
        pOutlinedRect(ctx, left, top, shop.gateW, gateH, "#2d2132");
        pRect(ctx, left + 4, top + 3, shop.gateW - 8, 4, light);
        pRect(ctx, left + 5, top + gateH - 18, shop.gateW - 10, 14, light);
        pRect(ctx, left + 8, top + gateH + 1, shop.gateW - 16, 10, isParty ? light : "rgba(245,185,104,0.35)");
        if (isParty) {
            // Dải đèn LED xập xình dọc mái hiên & luồng sáng trước cửa
            for (let i = 0; i < 6; i++) {
                const bulbCol = palette[(i + beat) % palette.length];
                pRect(ctx, shop.x + 12 + i * ((shop.w - 28) / 5), top - 8, 7, 7, bulbCol);
            }
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = palette[(beat + 1) % palette.length];
            const sweep = Math.sin(performance.now() / 320) * 26;
            ctx.beginPath();
            ctx.moveTo(left + shop.gateW * 0.3, top + 6);
            ctx.lineTo(left - 18 + sweep, top + 96);
            ctx.lineTo(left + 32 + sweep, top + 96);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = palette[(beat + 3) % palette.length];
            ctx.beginPath();
            ctx.moveTo(left + shop.gateW * 0.7, top + 6);
            ctx.lineTo(left + shop.gateW - 32 - sweep, top + 96);
            ctx.lineTo(left + shop.gateW + 18 - sweep, top + 96);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }
    drawDirectionSignpostsInWorld();
    for (const spot of npcMeetingSpots) {
        pOutlinedRect(ctx, spot.x - 54, spot.y - 42, 108, 20, "#ecd3ab");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.textAlign = "center";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(spot.label, spot.x, spot.y - 28);
    }

    if (activeVehicle) drawOwnedVehicle(activeVehicle);
    else if (ridingBicycle) {
        drawBikeFrame(ctx, player.x + 1, player.y + 11, "#d07359");
        drawBitmapCharacter(player.x + 2, player.y - 13, playerConfig, player.dir, 0, false, 1.35, true);
    } else {
        drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
    }
    drawPlayerNameLabel(player.x, player.y);
    drawFloatingTextsInWorld();

    ctx.restore();

    // 2. Tông màu riêng cho từng khu, sau đó phủ ánh sáng theo giờ và thời tiết.
    drawZoneColorGradeOverlay();
    drawDayNightLightingOverlay();

    // 3. Giao diện HUD cố định trên màn hình
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const hasShip = hasDeliveryVehicle();
    if (!document.body.classList.contains('is-mobile')) {
        pOutlinedRect(ctx, 14, canvas.height - 38, 656, 30, "#ecd3ab");
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillStyle = PAL.OUTLINE;
        ctx.textAlign = "left";
        ctx.fillText(
            hasShip
                ? "[E] Tương tác | [F] Ship hàng | [G] Xe cà phê | [V] Xe cá nhân | [M] Sơ đồ"
                : "[E] Tương tác | [G] Xe cà phê | [V] Xe cá nhân | [M] Sơ đồ",
            24,
            canvas.height - 19,
            636
        );
    }

    if (activeDeliveryOrder) {
        const atTarget = currentZone === activeDeliveryOrder.zoneKey;
        pOutlinedRect(ctx, 14, 118, 320, 28, atTarget ? "#b6d6a0" : "#ffe6a7");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(
            `🛵 Ship: ${activeDeliveryOrder.cups}x ${activeDeliveryOrder.recipeName} → ${activeDeliveryOrder.zoneName} (<${formatDeadlineClock(activeDeliveryOrder.deadlineHour)})`,
            24,
            136,
            300
        );
    }

    if (vipRushTimer > 0) {
        const secsLeft = Math.ceil(vipRushTimer / 60);
        pOutlinedRect(ctx, 14, activeDeliveryOrder ? 152 : 118, 260, 26, "#f0b643");
        ctx.fillStyle = "#7b241c";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`🔥 GIỜ CAO ĐIỂM VIP (${secsLeft}s · Khách x1.6)`, 24, (activeDeliveryOrder ? 152 : 118) + 17);
    }

    drawInteractionBanner();
    drawGuideCompassAndBeacon();
    drawMinimalHUD((zInfo ? zInfo.name : "Khu phố") + " (x" + (zInfo ? zInfo.priceMultiplier : 1) + ")");
    if (festival) {
        pOutlinedRect(ctx, 340, 119, 320, 28, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🎉 ${festival.name}`, 500, 138);
    }
    drawToastOverlay();

    drawRentalModal();
    drawMarketModal();
    drawBrewModal();
    drawMapModal();
    drawNPCSchedule();
    drawSleepSummaryModal();
    drawDialogueModal();
    drawFestivalPanel();
    if (showGarage) drawGarage();
    drawScreenPopups();
}

function drawStoryNPCsInWorld() {
    storyNPCs.forEach((npc) => {
        if (npc.meeting?.zone !== currentZone || npc.meeting.shop) return;
        const cfg = {
            genderIndex: npc.genderIndex,
            look: npc.look,
            outfitIndex: 0,
            outfits: [{ color: npc.shirt, shadow: npc.shadow, shorts: npc.shorts }],
            accessoryIndex: 0,
            accessories: [{ type: npc.accessory || 'none' }]
        };
        drawBitmapCharacter(npc.x, npc.y, cfg, npc.dir > 0 ? 'right' : 'left', npc.animFrame, true, 1.45);
        const isDeliveryTarget = activeDeliveryOrder && activeDeliveryOrder.zoneKey === currentZone && activeDeliveryOrder.customerId === npc.id;
        if (isDeliveryTarget) {
            const bob = Math.sin(tickCount * 0.14) * 3;
            pOutlinedRect(ctx, npc.x + 7, npc.y - 46 + bob, 22, 24, "#e74c3c");
            pRect(ctx, npc.x + 15, npc.y - 22 + bob, 6, 4, "#2b1d16");
            ctx.fillStyle = "#ffe066";
            ctx.font = "bold 17px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("!", npc.x + 18, npc.y - 28 + bob);
        }
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        const width = ctx.measureText(npc.name).width + 14;
        pOutlinedRect(ctx, npc.x + 18 - width / 2, npc.y - 20, width, 20, isDeliveryTarget ? "#ffe066" : "#ecd3ab");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(npc.name, npc.x + 18, npc.y - 6);
    });
}

function handleNPCDialogueClick(mouseX, mouseY) {
    if (mouseX >= 680 && mouseX <= 880 && mouseY >= 498 && mouseY <= 523 &&
        relationshipAction(activeDialogueNPC)) {
        handleRelationshipAction(activeDialogueNPC);
        return;
    }
    if (purchasedGifts.length && !activeDialogueNPC.giftedToday &&
        mouseX >= 680 && mouseX <= 880 && mouseY >= 526 && mouseY <= 553) {
        giftShopItem();
        return;
    }
    if (!activeDialogueNPC.giftedToday && mouseY >= 577 && mouseY <= 604) {
        for (let idx = 0; idx < GAME_CONFIG.RECIPES.length; idx++) {
            const bx = 310 + idx * 96;
            if (mouseX >= bx && mouseX <= bx + 92) {
                giftDrinkToActiveNPC(idx);
                return;
            }
        }
    }
    advanceDialogue();
}   

function drawDialogueModal() {
    if (!activeDialogueNPC) return;
    const npc = activeDialogueNPC;
    const dialogues = getNPCDialogues(npc);
    const text = dialogues[npc.dialogueIndex] || "";
    const partner = npc.romancePartnerId
        ? storyNPCs.find((candidate) => candidate.id === npc.romancePartnerId)
        : null;
    const isRival = Boolean(partner) && npc.genderIndex === playerConfig.genderIndex;
    const isRomanceable = Boolean(partner) && npc.genderIndex !== playerConfig.genderIndex;

    pOutlinedRect(ctx, 90, 445, 820, 175, "#ecd3ab");
    pOutlinedRect(ctx, 100, 455, 800, 155, "#fff6e5");

    // Khung chân dung nhân vật bên trái hộp thoại
    pOutlinedRect(ctx, 118, 470, 105, 125, "#d9c8b2");
    const portraitCfg = {
        genderIndex: npc.genderIndex ?? 0,
        look: npc.look,
        outfitIndex: 0,
        outfits: [{ color: npc.shirt || "#4f8a46", shadow: npc.shadow || "#335c2e", shorts: npc.shorts || "#2e3830" }],
        accessoryIndex: 0,
        accessories: [{ type: npc.accessory || 'none' }]
    };
    drawBitmapCharacter(144, 488, portraitCfg, 'down', 0, false, 2.3);

    // Tên + Vai trò + Nhãn phân loại + Điểm thân thiết trong hộp thoại
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.fillText(npc.name, 244, 488, 218);

    if (isRomanceable && !spouse && marriageProfiles[npc.id]) {
        const [capital, help] = marriageProfiles[npc.id];
        pOutlinedRect(ctx, 244, 413, 640, 26, "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(`Sau cưới: góp ${capital.toLocaleString('vi-VN')}đ mở quán · Phụ xe: tiết kiệm ${help} thể lực/ly`, 254, 430, 618);
    }

    const tagText = isRomanceable
        ? "❤️ Có thể theo đuổi"
        : (isRival ? (`⚡ Tình địch (${partner.name})`) : "🤝 Cư dân / Khách quen");
    const tagBg = isRomanceable ? "#fce4ec" : (isRival ? "#ede7f6" : "#e8f5e9");
    const tagCol = isRomanceable ? "#c2185b" : (isRival ? "#5e35b1" : "#2e7d32");
    pOutlinedRect(ctx, 470, 466, 200, 24, tagBg);
    ctx.fillStyle = tagCol;
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(tagText, 570, 482, 190);

    // Thanh điểm thân thiết (nền tảng cho Bạn Thân / Khách Quen / Nhà Đầu Tư sau này)
    pOutlinedRect(ctx, 680, 466, 204, 24, "#fff0f5");
    ctx.fillStyle = "#c2185b";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    const relationshipDays = npc.relationshipDays || 0;
    const hearts = Math.floor(relationshipDays / 6);
    ctx.fillText(isRomanceable ? `♥ ${hearts}/10 · ${relationshipDays}/60 ngày` :
        `💖 Thân thiết: ${npc.friendship || 0} điểm`, 782, 482);
    const action = relationshipAction(npc);
    if (action) {
        pOutlinedRect(ctx, 680, 498, 200, 25, "#f6d59a");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(action, 780, 515, 186);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#6e4736";
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    const role = npc.role || "Người Sài Gòn";
    const birthdayLabel = npc.birthday === playerStats.dayOfYear ? " · 🎂 Sinh nhật hôm nay" : "";
    ctx.fillText(role + birthdayLabel, 244, 510, action ? 425 : 625);

    // Tự động xuống dòng lời thoại tiếng Việt
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "600 15.5px 'Chakra Petch', sans-serif";
    const words = text.split(' ');
    let line = '';
    let ly = 528;
    const maxW = 635;
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        if (ctx.measureText(testLine).width > maxW && i > 0) {
            ctx.fillText(line.trim(), 244, ly);
            line = words[i] + ' ';
            ly += 19;
        } else {
            line = testLine;
        }
    }
    if (line.trim()) ctx.fillText(line.trim(), 244, ly);

    // Hàng nút Mời nước tăng điểm thân thiết (tối đa 1 lần/ngày)
    ctx.textAlign = "left";
    ctx.fillStyle = "#7a4424";
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    if (npc.giftedToday) {
        ctx.fillText("✅ Hôm nay đã mời nước nhân vật này", 244, 595);
    } else {
        ctx.fillText("🎁 Mời:", 244, 595);
        GAME_CONFIG.RECIPES.forEach((rec, idx) => {
            const bx = 310 + idx * 96;
            const unlocked = isRecipeUnlocked(rec.id);
            const canMake = unlocked && Object.entries(rec.need).every(([ing, amt]) => (inventory[ing] || 0) >= amt);
            pOutlinedRect(ctx, bx, 577, 92, 26, !unlocked ? "#d8cbb5" : (canMake ? "#f7d794" : "#dfd1b4"));
            ctx.fillStyle = canMake ? PAL.OUTLINE : "#8a7c72";
            ctx.font = "bold 11px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(unlocked ? `${rec.icon} ${rec.name.replace("Cà Phê ", "CF ")}` : "🔒 Chưa mở", bx + 46, 595, 86);
        });
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#963420";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    if (purchasedGifts.length && !npc.giftedToday) {
        pOutlinedRect(ctx, 680, 526, 200, 26, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.textAlign = "center";
        ctx.fillText("Tặng " + purchasedGifts[0].name, 780, 543, 186);
        ctx.textAlign = "right";
        ctx.fillStyle = "#963420";
    }
    const hint = (npc.dialogueIndex < dialogues.length - 1)
        ? "[Click / E: Tiếp ▶]"
        : "[Click / E: Đóng ✖]";
    ctx.fillText(hint, 886, 569);
}

function drawVendorOnSidewalk(x, y) {
    const bob = (vendorNPC.animFrame % 2 === 1) ? -1 : 0;
    pRect(ctx, x - 12, y + 38, 28, 5, "rgba(43, 29, 22, 0.38)");
    pRect(ctx, x - 20, y + 14 + bob, 44, 3, "#8c5830");
    pRect(ctx, x - 18, y + 17 + bob, 2, 9, "#261914");
    pRect(ctx, x + 20, y + 17 + bob, 2, 9, "#261914");

    const drawRoundBasket = (bx, by, fruitCol) => {
        pRect(ctx, bx + 2, by, 12, 2, PAL.OUTLINE);
        pRect(ctx, bx, by + 2, 16, 6, PAL.OUTLINE);
        pRect(ctx, bx + 2, by + 8, 12, 3, PAL.OUTLINE);
        pRect(ctx, bx + 2, by + 2, 12, 6, "#c99b59");
        pRect(ctx, bx + 4, by + 8, 8, 1, "#a6754b");
        pRect(ctx, bx + 3, by + 1, 10, 3, fruitCol);
    };
    drawRoundBasket(x - 25, y + 24 + bob, "#7bb357");
    drawRoundBasket(x + 13, y + 24 + bob, "#e89938");

    const vendorCfg = {
        genderIndex: 1,
        outfitIndex: 0,
        outfits: [{ color: "#7d5a78", shadow: "#593e55", shorts: "#2e2927" }],
        accessoryIndex: 0,
        accessories: [{ type: "none" }]
    };
    drawBitmapCharacter(x - 11, y - 4, vendorCfg, vendorNPC.dir > 0 ? 'right' : 'left', vendorNPC.animFrame, true, 1.15);

    ctx.fillStyle = "#e3c485";
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 9 + bob);
    ctx.lineTo(x + 17, y + 4 + bob);
    ctx.lineTo(x - 13, y + 4 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PAL.OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawMovingBikeTopDown(b) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    drawParkedScooter(ctx, x, y + 8, b.bikeColor, true, 1.5, b.dir < 0);

    const riderCfg = {
        genderIndex: 0,
        outfitIndex: 0,
        outfits: [{ color: b.shirtColor, shadow: "#59544f", shorts: "#2e3136" }],
        accessoryIndex: 0,
        accessories: [{ type: b.hat === "helmet" ? "cap" : "none" }]
    };
    drawBitmapCharacter(x + 9, y - 15, riderCfg, b.dir > 0 ? 'right' : 'left', 0, false, 1.05);
}

function drawPlayerNameLabel(px, py) {
    const cx = px + 18;
    const cy = py - 10;
    ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
    const w = Math.max(playerConfig.name.length * 8.5 + 16, ctx.measureText(playerConfig.name).width + 16);
    pOutlinedRect(ctx, cx - w / 2, cy - 16, w, 20, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.name, cx, cy - 1);
}

function gameLoop(now = performance.now()) {
    const elapsedMs = Math.min(100, Math.max(1, now - lastFrameTime));
    lastFrameTime = now;
    dt = elapsedMs / 16.667;
    tickCount++;

    updateGameTime(elapsedMs / 1000);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (busScene) {
        const progress = Math.min(1, Math.max(0, (now - busScene.started) / 2800));
        drawBusScene(progress);
        if (progress === 1) {
            const { onArrival } = busScene;
            busScene = null;
            onArrival();
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    if (showYearSummaryModal) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        drawYearSummaryModal();
    } else if (yearTwo.showTrailer) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        drawYearTwoTrailer();
    } else if (currentGameState === GAME_STATES.WELCOME) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        drawWelcome();
    } else if (currentGameState === GAME_STATES.MENU) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        drawMenu();
    } else if (currentGameState === GAME_STATES.CHARACTER_CREATION) {
        if (playerFormFields) playerFormFields.style.display = 'grid';
        birthdayField.hidden = false;
        drawCharacterCreation();
    } else if (currentGameState === GAME_STATES.INTRO) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        drawIntro();
    } else if (currentGameState === GAME_STATES.PLAYING_HOME) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        updateHome();
        drawHome();
    } else if (currentGameState === GAME_STATES.PLAYING_STREET) {
        if (playerFormFields) playerFormFields.style.display = 'none';
        if (showBusRoutes) {
            drawStreet();
            drawBusRouteMenu();
        } else if (indoorShop) {
            updateShopInterior();
            if (indoorShop) drawShopInterior();
            else drawStreet();
        } else {
            updateStreet();
            drawStreet();
        }
    }

    if (window.GameAudio) {
        const px = player.x + 18;
        const py = player.y + 24;
        let nearestBike = null;
        let minBikeDist = Infinity;
        for (const b of streetMotorbikes) {
            const dx = b.x - px;
            const d = Math.hypot(dx, b.y - py);
            if (d < minBikeDist) {
                minBikeDist = d;
                nearestBike = { dist: d, dx, speed: b.speed };
            }
        }
        let nearestCyclistDist = Infinity;
        for (const cy of breezeCyclists) {
            const d = Math.hypot(cy.x - px, cy.y - py);
            if (d < nearestCyclistDist) nearestCyclistDist = d;
        }
        GameAudio.updateFrame({
            gameState: currentGameState,
            zone: currentZone,
            hour: playerStats.hour,
            weather: playerStats.weather,
            isIndoors: currentGameState === GAME_STATES.PLAYING_HOME || Boolean(indoorShop),
            isFestival: currentZone === 'PARK' && Boolean(getTodayFestival()),
            isMoving: player.isMoving,
            animFrame: player.animFrame,
            activeVehicle: activeVehicle ? activeVehicle.id : null,
            ridingBicycle: ridingBicycle,
            isPushingCart: coffeeCart.isPushed,
            nearestBike: nearestBike,
            nearestCyclistDist: nearestCyclistDist
        });
    }

    checkDeliveryExpiration();
    if (showHandbookModal) drawHandbookModal();
    if (showDeliveryModal) drawDeliveryModal();
    if (typeof updateMobileControlsUI === 'function') updateMobileControlsUI();

    requestAnimationFrame(gameLoop);
}

// ============================================================================
// HỆ THỐNG ĐĂNG NHẬP & LƯU/TẢI CLOUD (SUPABASE)
// ============================================================================
function exportSaveData() {
    const bizOut = {};
    for (const [id, b] of Object.entries(businesses)) {
        bizOut[id] = {
            typeId: b.type?.id || 'cafe',
            partnerNpcId: b.partner?.npc?.id || null,
            partnerShare: b.partner?.share || 0,
            partnerRisk: b.partner?.risk ?? 0.01,
            partnerPaperwork: b.partner?.paperwork || 'Có hợp đồng và biên nhận',
            quote: b.quote,
            zone: b.zone,
            pending: Boolean(b.pending),
            opensDay: b.opensDay,
            upgrades: b.upgrades ? { ...b.upgrades } : {},
            hasStaff: Boolean(b.hasStaff),
            rentOverdue: Boolean(b.rentOverdue),
            overdueAmount: b.overdueAmount || 0
        };
    }
    const npcStates = {};
    storyNPCs.forEach((n) => {
        npcStates[n.id] = {
            friendship: n.friendship || 0,
            talkedToday: Boolean(n.talkedToday),
            giftedToday: Boolean(n.giftedToday),
            relationshipDays: n.relationshipDays || 0,
            lastRelationshipDay: n.lastRelationshipDay ?? null,
            repMilestoneClaimed: Boolean(n.repMilestoneClaimed)
        };
    });
    return {
        v: 2,
        yearTwo: { ...yearTwo, showTrailer: false, bag: { ...yearTwo.bag }, stocks: { ...yearTwo.stocks } },
        playerConfig: {
            name: playerConfig.name,
            birthday: playerConfig.birthday,
            genderIndex: playerConfig.genderIndex,
            outfitIndex: playerConfig.outfitIndex,
            outfits: playerConfig.outfits.map((o) => ({ ...o })),
            accessoryIndex: playerConfig.accessoryIndex
        },
        playerStats: { ...playerStats },
        inventory: { ...inventory },
        inventoryBatches: {
            coffee: (inventoryBatches.coffee || []).map((b) => ({ ...b })),
            milk: (inventoryBatches.milk || []).map((b) => ({ ...b })),
            fruit: (inventoryBatches.fruit || []).map((b) => ({ ...b }))
        },
        dailyReport: { ...dailyReport },
        currentZone,
        inHome: currentGameState === GAME_STATES.PLAYING_HOME,
        playerPos: { x: Math.round(player.x), y: Math.round(player.y), dir: player.dir },
        coffeeCart: { ...coffeeCart },
        cityReputation,
        chapterProgress: { ...chapterProgress },
        customerReputation,
        bankDebt,
        dailyLoanPayment,
        creditScore,
        rentedProperties: { ...rentedProperties },
        businesses: bizOut,
        ownedVehicles: Array.from(ownedVehicles),
        activeVehicleId: activeVehicle?.id || null,
        npcStates,
        engagedNpcId: engagedNPC?.id || null,
        spouseId: spouse?.id || null,
        weddingDay,
        hasEngagementRing,
        spouseBusinessFund,
        tailoringOrders: Array.from(tailoringOrders.entries()),
        purchasedGifts: purchasedGifts.map((g) => ({ ...g })),
        rejectedPartners: Array.from(rejectedPartners),
        investigatedPartners: Array.from(investigatedPartners),
        briefedStarter,
        briefedPhase,
        briefedEventDay,
        birthdayCelebratedYear,
        fridgeLevel,
        totalCupsSold,
        totalRevenueEarned,
        unlockedRecipes: Array.from(unlockedRecipes),
        recipeQuestStats: { ...recipeQuestStats },
        unlockedSignatures: Array.from(unlockedSignatures),
        yearOneSummarySeen,
        tutorialStep,
        tutorialSkipped,
        yearFestivals,
        dailyEventId: dailyEvent?.id || null,
        dailyQuest: dailyQuest ? { ...dailyQuest } : null,
        vipSpawnedToday,
        activeDeliveryOrder,
        deliveryCompletedToday
    };
}

function applySaveData(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.yearTwo) {
        Object.assign(yearTwo, data.yearTwo);
        yearTwo.showTrailer = false;
        yearTwo.bag = { flowers: 0, strawberries: 0, arabica: 0, coconut: 0, seafood: 0, silk: 0, oysters: 0, seaSalt: 0, ...(data.yearTwo.bag || {}) };
        yearTwo.stocks = { flowers: 0, strawberries: 0, arabica: 0, coconut: 0, seafood: 0, silk: 0, oysters: 0, seaSalt: 0, ...(data.yearTwo.stocks || {}) };
    }
    if (data.playerConfig) {
        const savedOutfits = Array.isArray(data.playerConfig.outfits) && data.playerConfig.outfits.length >= 3
            ? data.playerConfig.outfits.map((o) => ({ ...o }))
            : null;
        Object.assign(playerConfig, data.playerConfig);
        if (savedOutfits) playerConfig.outfits = savedOutfits;
        playerConfig.genderIndex = Math.max(0, Math.min(playerConfig.genders.length - 1, Number(playerConfig.genderIndex) || 0));
        playerConfig.outfitIndex = Math.max(0, Math.min(playerConfig.outfits.length - 1, Number(playerConfig.outfitIndex) || 0));
        playerConfig.accessoryIndex = Math.max(0, Math.min(playerConfig.accessories.length - 1, Number(playerConfig.accessoryIndex) || 0));
    }
    if (data.playerStats) Object.assign(playerStats, data.playerStats);
    if (data.inventory) Object.assign(inventory, data.inventory);
    if (data.inventoryBatches) {
        for (const k of ['coffee', 'milk', 'fruit']) {
            inventoryBatches[k] = Array.isArray(data.inventoryBatches[k])
                ? data.inventoryBatches[k].map((b) => ({ qty: Number(b.qty) || 0, daysLeft: Number(b.daysLeft) || INGREDIENT_SHELF_LIFE[k] }))
                : [];
        }
        syncInventoryTotals();
    } else if (data.inventory) {
        for (const k of ['coffee', 'milk', 'fruit']) {
            const qty = Math.max(0, Number(inventory[k]) || 0);
            inventoryBatches[k] = qty > 0 ? [{ qty, daysLeft: INGREDIENT_SHELF_LIFE[k] }] : [];
        }
    }
    if (data.dailyReport) Object.assign(dailyReport, data.dailyReport);
    if (data.coffeeCart) Object.assign(coffeeCart, data.coffeeCart);
    if (typeof data.cityReputation === 'number') cityReputation = data.cityReputation;
    if (data.chapterProgress) Object.assign(chapterProgress, data.chapterProgress);
    if (typeof data.customerReputation === 'number') customerReputation = data.customerReputation;
    if (typeof data.bankDebt === 'number') bankDebt = data.bankDebt;
    if (typeof data.dailyLoanPayment === 'number') dailyLoanPayment = data.dailyLoanPayment;
    if (typeof data.creditScore === 'number') creditScore = data.creditScore;

    Object.keys(rentedProperties).forEach((k) => delete rentedProperties[k]);
    if (data.rentedProperties) Object.assign(rentedProperties, data.rentedProperties);

    Object.keys(businesses).forEach((k) => delete businesses[k]);
    if (data.businesses) {
        const allRentals = Object.values(GAME_CONFIG.RENTALS).flat();
        for (const [id, b] of Object.entries(data.businesses)) {
            const rental = allRentals.find((r) => r.id === id);
            const type = businessTypes.find((t) => t.id === b.typeId) || businessTypes[0];
            const partnerNpc = b.partnerNpcId ? storyNPCs.find((n) => n.id === b.partnerNpcId) : null;
            if (rental) {
                businesses[id] = {
                    rental,
                    type,
                    partner: partnerNpc ? {
                        npc: partnerNpc,
                        share: b.partnerShare || 0.28,
                        risk: b.partnerRisk ?? 0.01,
                        paperwork: b.partnerPaperwork || 'Có hợp đồng và biên nhận'
                    } : null,
                    quote: b.quote || { deposit: 0, due: 0, familyFund: 0, partnerFund: 0 },
                    zone: b.zone || 'HOME_STREET',
                    pending: Boolean(b.pending),
                    opensDay: b.opensDay || 1,
                    upgrades: b.upgrades || {},
                    hasStaff: Boolean(b.hasStaff),
                    rentOverdue: Boolean(b.rentOverdue),
                    overdueAmount: Number(b.overdueAmount) || 0
                };
            }
        }
    }

    ownedVehicles.clear();
    if (Array.isArray(data.ownedVehicles)) data.ownedVehicles.forEach((id) => ownedVehicles.add(id));
    activeVehicle = data.activeVehicleId ? (showroomVehicles.find((v) => v.id === data.activeVehicleId) || null) : null;

    if (data.npcStates) {
        storyNPCs.forEach((n) => {
            const st = data.npcStates[n.id];
            if (st) Object.assign(n, st);
        });
    }
    engagedNPC = data.engagedNpcId ? (storyNPCs.find((n) => n.id === data.engagedNpcId) || null) : null;
    spouse = data.spouseId ? (storyNPCs.find((n) => n.id === data.spouseId) || null) : null;
    weddingDay = data.weddingDay ?? null;
    hasEngagementRing = Boolean(data.hasEngagementRing);
    spouseBusinessFund = data.spouseBusinessFund || 0;
    tailoringOrders.clear();
    if (Array.isArray(data.tailoringOrders)) {
        data.tailoringOrders.forEach(([k, v]) => { if (k) tailoringOrders.set(k, v); });
    }
    purchasedGifts.length = 0;
    if (Array.isArray(data.purchasedGifts)) {
        data.purchasedGifts.forEach((g) => { if (g?.name) purchasedGifts.push({ ...g }); });
    }
    rejectedPartners.clear();
    if (Array.isArray(data.rejectedPartners)) {
        data.rejectedPartners.forEach((id) => rejectedPartners.add(id));
    }
    investigatedPartners.clear();
    if (Array.isArray(data.investigatedPartners)) {
        data.investigatedPartners.forEach((id) => investigatedPartners.add(id));
    }
    briefedStarter = Boolean(data.briefedStarter);
    briefedPhase = typeof data.briefedPhase === 'number' ? data.briefedPhase : -1;
    briefedEventDay = data.briefedEventDay || 0;
    birthdayCelebratedYear = Number(data.birthdayCelebratedYear) || 0;
    pendingBirthdayBriefing = null;
    fridgeLevel = Math.max(0, Math.min(FRIDGE_UPGRADES.length - 1, Number(data.fridgeLevel) || 0));
    totalCupsSold = Math.max(0, Number(data.totalCupsSold) || 0);
    totalRevenueEarned = Math.max(0, Number(data.totalRevenueEarned) || 0);
    unlockedRecipes.clear();
    if (Array.isArray(data.unlockedRecipes) && data.unlockedRecipes.length) {
        STARTER_RECIPE_IDS.forEach((id) => unlockedRecipes.add(id));
        data.unlockedRecipes.forEach((id) => unlockedRecipes.add(id));
    } else if ((playerStats.day || 1) > 3 || totalCupsSold >= 18 || Object.keys(rentedProperties).length > 0) {
        GAME_CONFIG.RECIPES.forEach((r) => unlockedRecipes.add(r.id));
    } else {
        STARTER_RECIPE_IDS.forEach((id) => unlockedRecipes.add(id));
    }
    Object.assign(recipeQuestStats, {
        fruitBought: 0,
        cupsOutsideHome: 0,
        npcDrinksGifted: 0,
        traCamSaSold: 0,
        questsOrShipsDone: 0,
        ...(data.recipeQuestStats || {})
    });
    unlockedSignatures.clear();
    if (Array.isArray(data.unlockedSignatures)) {
        data.unlockedSignatures.forEach((id) => unlockedSignatures.add(id));
    }
    yearOneSummarySeen = Boolean(data.yearOneSummarySeen);
    showYearSummaryModal = false;
    if (typeof data.tutorialStep === 'number') {
        tutorialStep = Math.max(0, Math.min(TUTORIAL_STEPS.length, data.tutorialStep));
        tutorialSkipped = Boolean(data.tutorialSkipped);
    } else if ((playerStats.day || 1) > 1 || Object.keys(rentedProperties).length > 0 || totalCupsSold > 0) {
        tutorialStep = TUTORIAL_STEPS.length;
        tutorialSkipped = false;
    } else {
        tutorialStep = 0;
        tutorialSkipped = false;
    }
    lowEnergyWarned = false;
    if (Array.isArray(data.yearFestivals) && data.yearFestivals.length) yearFestivals = data.yearFestivals;
    dailyEvent = data.dailyEventId ? (DAILY_EVENTS.find((ev) => ev.id === data.dailyEventId) || null) : null;
    dailyQuest = data.dailyQuest ? { ...data.dailyQuest } : rollDailyQuest();
    vipSpawnedToday = Boolean(data.vipSpawnedToday);
    vipRushTimer = 0;
    activeDeliveryOrder = data.activeDeliveryOrder || null;
    deliveryCompletedToday = data.deliveryCompletedToday || 0;
    deliveryOffers = [];
    lyingOnHospitalBed = false;
    faintedInHospital = false;
    sleepForcedByMidnight = false;

    currentZone = data.currentZone || 'HOME_STREET';
    if (data.playerPos) {
        player.x = data.playerPos.x ?? 301;
        player.y = data.playerPos.y ?? 199;
        player.dir = data.playerPos.dir || 'down';
    }
    indoorShop = null;
    closeAllModals();
    currentGameState = data.inHome ? GAME_STATES.PLAYING_HOME : GAME_STATES.PLAYING_STREET;
    updateCamera(true);
    showToast(`☁️ Đã tải dữ liệu của ${playerConfig.name} (Ngày ${playerStats.dayOfYear}/100)!`);
    return true;
}

(function initCloudAuthUI() {
    const authModal = document.getElementById('authModal');
    const authCloseBtn = document.getElementById('authCloseBtn');
    const authTabLogin = document.getElementById('authTabLogin');
    const authTabRegister = document.getElementById('authTabRegister');
    const authUserInput = document.getElementById('authUserInput');
    const authPassInput = document.getElementById('authPassInput');
    const authStatusText = document.getElementById('authStatusText');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    if (!authModal || !window.GameCloud) return;

    let authMode = 'login';
    window.openCloudAuthModal = function (notice = '') {
        authStatusText.textContent = notice;
        authStatusText.style.color = '#c0392b';
        authModal.hidden = false;
        authUserInput.focus();
    };

    function setMode(mode) {
        authMode = mode;
        authTabLogin.classList.toggle('active', mode === 'login');
        authTabRegister.classList.toggle('active', mode === 'register');
        authSubmitBtn.textContent = mode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN';
        authStatusText.textContent = '';
    }

    authTabLogin.addEventListener('click', () => setMode('login'));
    authTabRegister.addEventListener('click', () => setMode('register'));
    authCloseBtn.addEventListener('click', () => { authModal.hidden = true; });

    async function submitAuth() {
        const user = authUserInput.value.trim();
        const pass = authPassInput.value;
        authSubmitBtn.disabled = true;
        authStatusText.style.color = '#6a5147';
        authStatusText.textContent = 'Đang kết nối Supabase...';
        const res = authMode === 'login'
            ? await GameCloud.signIn(user, pass)
            : await GameCloud.signUp(user, pass);
        authSubmitBtn.disabled = false;
        if (res.ok) {
            authModal.hidden = true;
            GameAudio?.playUnlock();
            if (authMode === 'register' && !playerConfig.name) {
                playerConfig.name = GameCloud.getUsername();
            }
        } else {
            GameAudio?.playError();
            authStatusText.style.color = '#c0392b';
            authStatusText.textContent = res.error;
        }
    }

    authSubmitBtn.addEventListener('click', submitAuth);
    authPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAuth();
    });

    if (GameCloud.isLoggedIn()) {
        GameCloud.loadGame();
    }
})();

if (YEAR_TWO_PREVIEW) {
    playerStats.day = GAME_CONFIG.TIME.DAYS_PER_YEAR;
    playerStats.dayOfYear = GAME_CONFIG.TIME.DAYS_PER_YEAR;
    yearTwo.backpack = true;
    confirmStartNextDay();
    currentGameState = GAME_STATES.PLAYING_STREET;
    switchZone(busTerminal.zone, busTerminal.arrivalX, busTerminal.arrivalY, 'up');
    if (new URLSearchParams(location.search).get('zone') === 'vungtau') {
        yearTwo.showTrailer = false;
        yearTwo.destination = 'VUNGTAU';
        yearTwo.province = 'VUNGTAU';
        yearTwo.travel = 'outbound';
        playerStats.hour = 10;
        switchZone('VUNGTAU_BAI_SAU', 970, 965, 'down');
    }
    if (new URLSearchParams(location.search).get('zone') === 'breeze') {
        yearTwo.showTrailer = false;
        switchZone('BREEZE_AREA', 470, 410, 'up');
    }
    const dalatPreviewZones = {
        dalat: 'DALAT_NIGHT',
        'dalat-greenhouse': 'DALAT_GREENHOUSE',
        'dalat-pine': 'DALAT_PINE'
    };
    const dalatPreviewZone = dalatPreviewZones[new URLSearchParams(location.search).get('zone')];
    if (dalatPreviewZone) {
        yearTwo.showTrailer = false;
        yearTwo.destination = 'DALAT';
        yearTwo.province = 'DALAT';
        yearTwo.travel = 'outbound';
        playerStats.hour = 10;
        const landmarkPreview = dalatPreviewZone === 'DALAT_PINE';
        switchZone(dalatPreviewZone, landmarkPreview ? 1400 : 970, landmarkPreview ? 600 : 965, 'down');
    }
    const mekongPreviewZones = {
        mekong: 'MEKONG_QUAY',
        'mekong-floating': 'MEKONG_FLOATING',
        'mekong-craft': 'MEKONG_CRAFT'
    };
    const mekongPreviewZone = mekongPreviewZones[new URLSearchParams(location.search).get('zone')];
    if (mekongPreviewZone) {
        yearTwo.showTrailer = false;
        yearTwo.destination = 'MEKONG';
        yearTwo.province = 'MEKONG';
        yearTwo.travel = 'outbound';
        playerStats.hour = 10;
        switchZone(mekongPreviewZone, 970, 965, 'down');
    }
}

// ============================================================================
// HỆ THỐNG HỖ TRỢ ĐIỆN THOẠI (RESPONSIVE SCALE + JOYSTICK ĐA ĐIỂM + NÚT CẢM ỨNG)
// ============================================================================
let updateMobileControlsUI = () => {};
(function initMobileSupport() {
    const mobileControls = document.getElementById('mobileControls');
    const toggleBtn = document.getElementById('toggleMobilePadBtn');
    const joystickEl = document.getElementById('touchJoystick');
    const knobEl = document.getElementById('touchJoystickKnob');
    const btnE = document.getElementById('btnTouchE');
    const btnQ = document.getElementById('btnTouchQ');
    const btnG = document.getElementById('btnTouchG');
    const btnC = document.getElementById('btnTouchC');
    const btnV = document.getElementById('btnTouchV');
    const btnF = document.getElementById('btnTouchF');
    const btnK = document.getElementById('btnTouchK');
    const btnH = document.getElementById('btnTouchH');
    const btnFs = document.getElementById('btnTouchFullscreen');

    let isTouchDevice = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const userAgent = navigator.userAgent || '';
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let manualMobilePad = false;
    let lastPadVisible = null;
    let lastLayoutKey = '';

    function isMobilePadEnabled() {
        return isTouchDevice || manualMobilePad;
    }

    function isInGameplayForPad() {
        return (currentGameState === GAME_STATES.PLAYING_HOME || currentGameState === GAME_STATES.PLAYING_STREET) &&
            !busScene && !showYearSummaryModal && !yearTwo.showTrailer;
    }

    function updateResponsiveLayout() {
        const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const mobileOn = isMobilePadEnabled();
        const isLandscape = vw > vh;
        const showPadNow = mobileOn && isInGameplayForPad();

        document.body.classList.toggle('is-mobile', mobileOn);
        document.body.classList.toggle('is-landscape', mobileOn && isLandscape);
        document.body.classList.toggle('is-portrait', mobileOn && !isLandscape);
        document.body.classList.toggle('is-android', mobileOn && isAndroid);
        document.body.classList.toggle('is-ios', mobileOn && isIOS);

        const bodyStyle = getComputedStyle(document.body);
        const bodyVerticalPadding = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
        const bodyHorizontalPadding = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);
        const appGap = mobileOn && !isLandscape && showPadNow ? 10 : 0;
        const padHeight = mobileOn && !isLandscape && showPadNow && mobileControls && !mobileControls.hidden
            ? mobileControls.getBoundingClientRect().height
            : 0;
        const edgeSpace = mobileOn ? 2 : 28;
        let sideRailSpace = 0;
        if (mobileOn && isLandscape && showPadNow && mobileControls) {
            const controlsRect = mobileControls.getBoundingClientRect();
            const topbarRect = mobileControls.querySelector('.mobile-topbar')?.getBoundingClientRect();
            const actionRect = mobileControls.querySelector('.action-cluster')?.getBoundingClientRect();
            const joystickRect = joystickEl?.getBoundingClientRect();
            const leftReach = Math.max(
                joystickRect ? joystickRect.right - controlsRect.left : 0,
                topbarRect ? topbarRect.right - controlsRect.left : 0
            );
            const rightReach = actionRect ? controlsRect.right - actionRect.left : 0;
            sideRailSpace = Math.max(leftReach, rightReach) + 4;
        }
        const availW = vw - edgeSpace - (mobileOn ? bodyHorizontalPadding : 0) - sideRailSpace * 2;
        // Portrait: measure the actual control panel instead of reserving a fixed 204px.
        // Landscape controls overlay the playfield, so they do not reduce its height.
        const availH = vh - edgeSpace - (mobileOn ? bodyVerticalPadding + appGap + padHeight : 0);
        const scale = Math.max(0.28, Math.min(1, availW / 1000, availH / 650));
        mobileFontBoostPx = (mobileOn || scale < 0.85) ? (scale < 0.55 ? 2.5 : 1.5) : 0;
        const key = `${scale.toFixed(4)}|${mobileOn}|${isLandscape}|${showPadNow}`;
        if (key !== lastLayoutKey) {
            lastLayoutKey = key;
            document.documentElement.style.setProperty('--game-scale', scale.toFixed(4));
        }
    }

    function triggerVirtualKey(key) {
        if (!key) return;
        GameAudio?.unlock();
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    // Mở khóa âm thanh Web Audio ngay lần chạm đầu tiên (iOS / Android)
    window.addEventListener('touchstart', () => {
        if (!isTouchDevice) {
            isTouchDevice = true;
            updateResponsiveLayout();
        }
        GameAudio?.unlock();
    }, { passive: true });

    window.addEventListener('resize', updateResponsiveLayout);
    window.addEventListener('orientationchange', () => setTimeout(updateResponsiveLayout, 80));
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateResponsiveLayout);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            manualMobilePad = !manualMobilePad;
            toggleBtn.style.background = manualMobilePad ? '#f0b643' : 'rgba(43, 29, 22, 0.85)';
            toggleBtn.style.color = manualMobilePad ? '#2b1d16' : '#fff3d6';
            updateResponsiveLayout();
            updateMobileControlsUI();
        });
    }

    // Nút Toàn màn hình cho điện thoại
    if (btnFs) {
        btnFs.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            GameAudio?.unlock();
            const docEl = document.documentElement;
            const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
            if (!isFs) {
                const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
                if (req) {
                    Promise.resolve(req.call(docEl)).catch(() => {
                        showToast('💡 Hãy xoay ngang máy hoặc Thêm vào Màn hình chính để chơi rộng hơn!');
                    });
                } else {
                    showToast('💡 Trên iPhone: bấm Chia sẻ → Thêm vào Màn hình chính để chơi toàn màn hình!');
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) Promise.resolve(exit.call(document)).catch(() => {});
            }
        });
    }

    // Gắn sự kiện phản hồi tức thì cho tất cả nút hành động [data-key]
    if (mobileControls) {
        mobileControls.querySelectorAll('[data-key]').forEach((btn) => {
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                triggerVirtualKey(btn.dataset.key);
            });
        });
    }

    // Cần gạt Joystick cảm ứng đa điểm (8 hướng mượt mà)
    let joyPointerId = null;

    function resetJoystick() {
        joyPointerId = null;
        if (knobEl) knobEl.style.transform = 'translate(0px, 0px)';
        keys.w = false;
        keys.s = false;
        keys.a = false;
        keys.d = false;
    }

    function updateJoystickFromPointer(clientX, clientY) {
        if (!joystickEl || !knobEl) return;
        const rect = joystickEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxDist = rect.width * 0.36;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist && dist > 0) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        knobEl.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
        if (isAnyModalOpen()) {
            keys.w = keys.s = keys.a = keys.d = false;
            return;
        }
        const nx = dx / maxDist;
        const ny = dy / maxDist;
        const deadzone = 0.26;
        keys.a = nx < -deadzone;
        keys.d = nx > deadzone;
        keys.w = ny < -deadzone;
        keys.s = ny > deadzone;
    }

    if (joystickEl) {
        joystickEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            GameAudio?.unlock();
            joyPointerId = e.pointerId;
            try { joystickEl.setPointerCapture(e.pointerId); } catch (_) {}
            updateJoystickFromPointer(e.clientX, e.clientY);
        });
        joystickEl.addEventListener('pointermove', (e) => {
            if (e.pointerId !== joyPointerId) return;
            e.preventDefault();
            updateJoystickFromPointer(e.clientX, e.clientY);
        });
        const endJoy = (e) => {
            if (e.pointerId !== joyPointerId) return;
            e.preventDefault();
            resetJoystick();
        };
        joystickEl.addEventListener('pointerup', endJoy);
        joystickEl.addEventListener('pointercancel', endJoy);
        joystickEl.addEventListener('lostpointercapture', resetJoystick);
        window.addEventListener('blur', resetJoystick);
    }

    let lastUiSig = '';
    updateMobileControlsUI = function () {
        if (!mobileControls) return;
        const visible = isMobilePadEnabled() && isInGameplayForPad();
        if (visible !== lastPadVisible) {
            lastPadVisible = visible;
            mobileControls.hidden = !visible;
            if (!visible) resetJoystick();
            updateResponsiveLayout();
        }
        if (!visible) return;

        const onStreet = currentGameState === GAME_STATES.PLAYING_STREET && !indoorShop;
        const showF = hasDeliveryVehicle() && !indoorShop;
        const showK = Boolean(indoorShop?.rental);
        const showH = onStreet && (ridingBicycle || Boolean(activeVehicle));
        const showC = onStreet && !coffeeCart.isPushed;

        let eLabel = '✋ Tương tác';
        let eHighlight = false;
        if (showSleepSummaryModal) {
            eLabel = '🌅 Qua ngày';
            eHighlight = true;
        } else if (activeDialogueNPC) {
            eLabel = '💬 Tiếp';
            eHighlight = true;
        } else if (selectedRentalModal && !businessDraft) {
            eLabel = '📋 Chọn ngành';
            eHighlight = true;
        } else if (nearbyInteractable) {
            eHighlight = true;
            const mapLabels = {
                BED: '🛏️ Ngủ',
                PC: '💻 Sổ sách',
                FRIDGE: '❄️ Tủ lạnh',
                CALENDAR: '📅 Lịch',
                TV: '📺 Xem TV',
                HOME_EXIT: '🚪 Ra phố',
                SHOP_ENTRY: '🚪 Vào quán',
                BREW_SPOT: '☕ Pha chế',
                SEIZED_CART: '👮 Chuộc xe',
                MARKET: '🛒 Đi chợ',
                NPC: '💬 Nói chuyện',
                ALLEY_BOARD: '📋 Bảng tin',
                DELIVERY_NPC: '🛵 Giao đơn',
                BUS: '🚌 Chọn tuyến',
                BACKPACK: '🎒 Mua ba lô',
                SPECIALTY: '🧺 Gom hàng',
                BICYCLE: ridingBicycle ? '🚲 Trả xe' : '🚲 Thuê xe',
                FESTIVAL: '🎉 Lễ hội',
                FESTIVAL_STALL: '☕ Quầy hội',
                WEDDING: '💍 Cử hành'
            };
            eLabel = mapLabels[nearbyInteractable.type] || '✋ Tương tác';
        } else if (indoorShop && !isAnyModalOpen()) {
            eLabel = '✋ Quầy / Nói';
        }

        const qLabel = (indoorShop && !isAnyModalOpen()) ? '🚪 Ra quán' : '✖ Đóng';
        const gLabel = coffeeCart.isPushed ? '🅿️ Đậu xe' : '🛒 Đẩy xe';
        const cLabel = coffeeCart.isOpen ? '🔒 Đóng xe' : '☕ Mở xe';

        const sig = `${onStreet}|${showF}|${showK}|${showH}|${showC}|${eLabel}|${eHighlight}|${qLabel}|${gLabel}|${cLabel}|${coffeeCart.isPushed}`;
        if (sig === lastUiSig) return;
        lastUiSig = sig;

        if (btnE) {
            btnE.textContent = eLabel;
            btnE.classList.toggle('has-action', eHighlight);
        }
        if (btnQ) btnQ.textContent = qLabel;
        if (btnG) {
            btnG.hidden = !onStreet;
            btnG.textContent = gLabel;
            btnG.classList.toggle('is-active', coffeeCart.isPushed);
        }
        if (btnC) {
            btnC.hidden = !showC;
            btnC.textContent = cLabel;
        }
        if (btnV) btnV.hidden = !onStreet;
        if (btnF) btnF.hidden = !showF;
        if (btnK) btnK.hidden = !showK;
        if (btnH) btnH.hidden = !showH;
    };

    updateResponsiveLayout();
})();

requestAnimationFrame(gameLoop);
