// game.js - Bộ điều khiển logic game 5AM (Phiên bản Stardew Valley: Bản đồ mở rộng 2000x1400 + Vòng lặp Ngày/Đêm, Đi chợ, Bán cà phê, Ngủ tổng kết ngày)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const nameInput = document.getElementById('playerNameInput');
const birthdayField = document.getElementById('playerBirthdayField');
const birthdayInput = document.getElementById('playerBirthdayInput');
const playerFormFields = document.getElementById('playerFormFields');
const PAL = GAME_CONFIG.PALETTE;
const GAME_STATES = GAME_CONFIG.STATES;

let currentGameState = GAME_STATES.WELCOME;
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
    const daysLeft = INGREDIENT_SHELF_LIFE[ingId];
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
let showTVModal = false;
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
    return !!(showTVModal || showHandbookModal || showDeliveryModal || showManagementModal || showBankModal || showGarage || showShopMenu || showFestivalPanel || showWallCalendar || showNPCSchedule || showMapModal || selectedRentalModal || showMarketModal || showBrewModal || showSleepSummaryModal || activeDialogueNPC);
}

function isTimePausedModalOpen() {
    return !!(showTVModal || showHandbookModal || showDeliveryModal || showManagementModal || showBankModal || showGarage || showShopMenu || showFestivalPanel || showWallCalendar || showNPCSchedule || showMapModal || selectedRentalModal || showMarketModal || showSleepSummaryModal || activeDialogueNPC);
}

function closeAllModals() {
    showTVModal = false;
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
    if ((document.activeElement === nameInput || document.activeElement === birthdayInput || !document.getElementById('authModal')?.hidden)) return;
    const low = e.key.toLowerCase();
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
            if (showBankModal) { if (low === 'q') closeAllModals(); else if(low==='e') takeBankLoan(); return; }
            if (showManagementModal) { if (low === 'q') closeAllModals(); return; }
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
            else if (showBrewModal && /^[1-3]$/.test(low)) brewAndSellDrink(GAME_CONFIG.RECIPES[Number(low) - 1]);
            return;
        }

        if (showGarage) {
            if (low === 'q' || (low === 'v' && !e.repeat)) closeAllModals();
            return;
        }
        if (low === 'v' && !e.repeat && currentGameState === GAME_STATES.PLAYING_STREET && !isAnyModalOpen()) {
            showGarage = true;
            return;
        }

        if (showWallCalendar || showFestivalPanel) {
            if (low === 'q') closeAllModals();
            return;
        }
        if (low === 'l' && !e.repeat) {
            toggleNPCSchedule();
        } else if (showNPCSchedule && low !== 'q') {
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
        } else if (low === 'q') {
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
        } else if (/^[1-6]$/.test(low) && showBrewModal) {
            const idx = Number(low) - 1;
            if (GAME_CONFIG.RECIPES[idx]) brewAndSellDrink(GAME_CONFIG.RECIPES[idx]);
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
    lovedDrink: 'caphe_sua',
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
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'caphe_den', dialogueIndex: 0,
        dialogues: [
            "Sáng nào chú cũng làm một ly Cà Phê Đen Đá mới tỉnh táo đi dạo được!",
            "Cháu pha đậm đà lắm, rảnh chú lại ghé ủng hộ tiếp nha."
        ]
    },
    {
        id: 'cust_chi_lan', name: "Chị Lan", role: "Nhân viên văn phòng", kind: 'resident',
        genderIndex: 1, x: 1320, y: 475, dir: -1, speed: 0.85, shirt: "#d97248", shadow: "#a34e2c", shorts: "#333942", accessory: "none",
        wantedRecipeIdx: 1, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 40, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'caphe_sua', dialogueIndex: 0,
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
        wantedRecipeIdx: 3, state: 'wandering', targetSpotId: null, targetX: 0, targetY: 0, orderTimer: 80, animFrame: 0, animTimer: 0,
        friendship: 0, talkedToday: false, giftedToday: false, lovedDrink: 'tra_dao', dialogueIndex: 0,
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
const npcScheduleZones = Object.keys(GAME_CONFIG.ZONES);
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
    }
}

function checkNPCFriendshipMilestone(npc) {
    if (!npc || npc.repMilestoneClaimed) return;
    if ((npc.friendship || 0) >= 100) {
        npc.repMilestoneClaimed = true;
        addCityReputation(2);
        addScreenPopup(500, 428, `🤝 Bạn thân ${npc.name}: +2 Danh tiếng!`, "#f0b643");
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
            if (dir === 'up' && isMoving && r >= 27) {
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
    showToast(`🎁 ${gift.name} cho ${npc.name} · +${points} thân thiết`);
}

function drawShopMenu() {
    pOutlinedRect(ctx, 255, 152, 490, 338, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(indoorShop.name, 500, 190, 420);
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
        selectedManagementShop = indoorShop.rental;
        showManagementModal = true;
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
    pOutlinedRect(ctx, 170, 72, 660, 514, "#ecd3ab");
    ctx.textAlign = "center"; ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.fillText(`Quản lý · ${bType.name}`, 500, 108);
    ctx.font = "bold 12.5px 'Chakra Petch', sans-serif";
    ctx.fillText(`Uy tín quán ${customerReputation}/100 · Danh tiếng TP ${cityReputation}/100 (Chuẩn ngành: ${bType.idealRep}) · Công suất khách: ${repPct}%`, 500, 134, 620);
    ctx.fillStyle = isOverdue ? "#c0392b" : "#5d4037";
    ctx.fillText(
        isOverdue
            ? `⚠️ ĐANG NỢ TIỀN MẶT BẰNG: ${moneyLabel(business.overdueAmount)} (Quán tạm ngừng sinh lời)`
            : `🏠 Tiền mặt bằng định kỳ (mỗi 25 ngày): ${moneyLabel(rentShare)} · Còn ${daysLeftRent} ngày tới kỳ đóng`,
        500, 158, 620
    );
    ctx.fillStyle = PAL.OUTLINE;
    ctx.fillText(`Giá bán ${(priceOptions[dailyPriceIndex] * 100).toFixed(0)}% · Món trọng tâm ${GAME_CONFIG.RECIPES[dailyRecipeIndex].name} · Khách quen hôm nay: ${dailyRegularOrders}/3`, 500, 182, 620);
    pOutlinedRect(ctx, 220, 200, 560, 38, "#fff3d6");
    ctx.fillText(`Giá bán: ${priceOptions.map((v,i)=>`${i===dailyPriceIndex?'●':'○'} ${Math.round(v*100)}%`).join('   ')}`, 500, 224);
    pOutlinedRect(ctx, 220, 246, 560, 38, "#fff3d6");
    ctx.fillText(`Món trọng tâm: ${GAME_CONFIG.RECIPES[dailyRecipeIndex].name}  ◀ ▶`, 500, 270);
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
    pOutlinedRect(ctx, 420, 524, 160, 36, "#f0b643");
    ctx.fillText("Đóng [Q]", 500, 548);
}

function handleManagementClick(x,y) {
    if (x>=420&&x<=580&&y>=524&&y<=560){closeAllModals();return;}
    if (x>=220&&x<=780&&y>=200&&y<=238){dailyPriceIndex=(dailyPriceIndex+1)%priceOptions.length;return;}
    if (x>=220&&x<=780&&y>=246&&y<=284){dailyRecipeIndex=(dailyRecipeIndex+1)%GAME_CONFIG.RECIPES.length;return;}
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
    pOutlinedRect(ctx,170,105,660,445,"#ecd3ab");
    ctx.textAlign="center";ctx.fillStyle=PAL.OUTLINE;
    ctx.font="bold 21px 'Chakra Petch', sans-serif";ctx.fillText("VietBank · Vay vốn khởi nghiệp",500,145);
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
    pOutlinedRect(ctx,420,493,160,34,"#f0b643");ctx.fillText("Đóng [Q]",500,516);
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
        const bx = 532 + idx * 124;
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

    // Khách / NPC đang có mặt trong quán (hoặc trực bệnh viện)
    floorVisitors.forEach((npc, index) => {
        if (lyingOnHospitalBed && npc.id === 'bac_si_tuan') return;
        const x = getShopVisitorX(index, floorVisitors.length);
        drawBitmapCharacter(x, 401, { genderIndex: npc.genderIndex, look: npc.look, outfitIndex: 0,
            outfits: [{ color: npc.shirt, shadow: npc.shadow, shorts: npc.shorts }],
            accessoryIndex: 0, accessories: [{ type: npc.accessory || 'none' }] }, 'down', 0, false, 1.4);
        ctx.textAlign = "center";
        ctx.fillStyle = shop.hospital ? "#1b4965" : "#fff3d6";
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.fillText(npc.name, x + 16, 398, 115);
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

    drawMinimalHUD(shop.name);
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

        drawShadeTree(c, 280, 360, 1.15);
        drawShadeTree(c, 1120, 360, 1.15);
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
    if (hourFloat >= 24.0) period = "ĐÊM";
    else if (wrapped >= 11.0 && wrapped < 13.5) period = "TRƯA";
    else if (wrapped >= 13.5 && wrapped < 18.0) period = "CHIỀU";
    else if (wrapped >= 18.0) period = "TỐI";
    return hh + ":" + mm + " " + period;
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
    playerStats.money -= HOSPITAL_FEE;
    dailyReport.hospitalCost += HOSPITAL_FEE;
    dailyReport.latePenalty = true;
    faintedInHospital = true;
    sleepForcedByMidnight = true;
    showSleepSummaryModal = true;

    addScreenPopup(110, 56, `-${HOSPITAL_FEE.toLocaleString('vi-VN')}đ`, "#e74c3c");
    GameAudio?.playError();
    GameAudio?.playSleep();
    showToast("🚑 Bạn đã kiệt sức và ngất xỉu! Nhập viện tại Khu Phố Đắt Hơn (-1.000.000đ viện phí).", 280);
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
    coffeeCart.isOpen = true;
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

    settleBusinesses();
    const spoiled = processDailyIngredientSpoilage();
    const spoiledParts = [];
    if (spoiled.coffee) spoiledParts.push(`${spoiled.coffee} 🫘 Cà phê`);
    if (spoiled.milk) spoiledParts.push(`${spoiled.milk} 🥫 Sữa`);
    if (spoiled.fruit) spoiledParts.push(`${spoiled.fruit} 🍊 Cam`);
    if (spoiledParts.length) {
        businessNews.push(`🗑️ Hư hỏng qua đêm: ${spoiledParts.join(', ')}`);
    }
    if(bankDebt>0){
        if(playerStats.money>=dailyLoanPayment){playerStats.money-=dailyLoanPayment;bankDebt-=dailyLoanPayment;creditScore=Math.min(100,creditScore+1);businessNews.push(`VietBank đã thu ${moneyLabel(dailyLoanPayment)} tiền góp.`);}
        else {creditScore=Math.max(0,creditScore-5);addCityReputation(-5);businessNews.push("Quá hạn VietBank · tín dụng -5, danh tiếng -5.");}
        if(bankDebt<=0){bankDebt=0;dailyLoanPayment=0;creditScore=Math.min(100,creditScore+5);businessNews.push("Đã tất toán khoản vay · hồ sơ tín dụng tăng.");}
    }
    if (spouse && Object.keys(rentedProperties).length) {
        const profile=marriageProfiles[spouse.id];
        if(playerStats.day%7===0) businessNews.push(`${spouse.name} phụ quản lý khách và kho, danh tiếng được giữ ổn định.`);
        if(profile && playerStats.day%14===0) customerReputation=Math.min(100,customerReputation+2);
    }
    const eventTag = dailyEvent ? ` · ${dailyEvent.icon} ${dailyEvent.title}: ${dailyEvent.desc}` : "";
    const cloudTag = window.GameCloud?.isLoggedIn() ? ` · ☁️ Lưu Ô ${GameCloud.activeSlot + 1}` : "";
    if (businessNews.length) {
        showToast(`${morningMsg}${eventTag} · ${businessNews.join(" · ")}${cloudTag}`, 400);
    } else {
        showToast(`${morningMsg}${eventTag}${cloudTag}`, dailyEvent ? 360 : 260);
    }

    // Reset thống kê ngày mới và đưa người chơi về cạnh giường trong phòng ngủ (hoặc cổng bệnh viện nếu vừa nhập viện)
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
        addScreenPopup(560, 56, "+" + item.packAmount + " " + item.icon + " " + item.name, "#2ecc71");
        showToast("🛒 Đã mua +" + item.packAmount + " phần [" + item.name + "] (-" + price.toLocaleString('vi-VN') + "đ)");
    }
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
    pOutlinedRect(ctx, 135, 110, 730, 420, "#fff3d6");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.font = "bold 24px 'Chakra Petch', sans-serif";
    ctx.fillText(festival.name, 500, 170, 530);
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("Đóng [Q]", 818, 148);
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

    const matchedCustomer = waitingHere.find((c) => GAME_CONFIG.RECIPES[c.wantedRecipeIdx].id === recipe.id);
    if (!matchedCustomer) {
        GameAudio?.playError();
        const wantedNames = waitingHere.map((c) => GAME_CONFIG.RECIPES[c.wantedRecipeIdx].name).join(', ');
        showToast("⚠️ Khách tại quầy đang gọi [" + wantedNames + "], không phải món này!");
        return;
    }

    const help = spouse && spotId === 'cart_mobile' && !Object.keys(rentedProperties).length
        ? marriageProfiles[spouse.id][1] : 0;
    const energyCost = Math.max(1, recipe.energyCost - help - (businesses[spotId]?.upgrades?.machine?1:0));
    if (playerStats.energy <= 0) {
        triggerHospitalization();
        return;
    }

    // Kiểm tra nguyên liệu
    for (const [ingId, reqCount] of Object.entries(recipe.need)) {
        if ((inventory[ingId] || 0) < reqCount) {
            GameAudio?.playError();
            showToast("⚠️ Thiếu nguyên liệu! Hãy ghé Tiệm Tạp Hóa Cô Ba ở Khu Nhà Mình để mua thêm.");
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

    // Tính giá bán theo hệ số Khu Phố
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const mult = zInfo && zInfo.priceMultiplier ? zInfo.priceMultiplier : 1.0;
    const business=businesses[spotId];
    const upgrades=business?.upgrades||{};
    const partnerShare = business?.partner?.share || 0;
    const reputationBonus=1+Math.min(0.15,customerReputation/500);
    const eventPriceMult = getDailyEventPriceMult(currentZone);
    const grossPrice = Math.round(recipe.baseSellPrice * mult * eventPriceMult * priceOptions[dailyPriceIndex] * reputationBonus / 1000) * 1000;
    const regularBonus = matchedCustomer.isRegularOrder ? Math.round(grossPrice * 0.1) : 0;
    const spouseCafeBonus = spouse && businesses[spotId]?.type.id === 'cafe' ? Math.round(grossPrice * 0.1) : 0;
    const cartSeatingTip = spotId === 'cart_mobile' && coffeeCart.seating ? 2000 : 0;
    const finalPrice = grossPrice + regularBonus + spouseCafeBonus + cartSeatingTip - Math.round(grossPrice * partnerShare);

    playerStats.money += finalPrice;
    recordChapterAction('sales');
    dailyReport.cupsSold += 1;
    dailyReport.revenue += finalPrice;
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
    matchedCustomer.wantedRecipeIdx = Math.floor(Math.random() * GAME_CONFIG.RECIPES.length);

    showToast(recipe.icon + " Đã phục vụ [" + recipe.name + "] thu về +" + finalPrice.toLocaleString('vi-VN') + "đ!", 160);
    if (playerStats.energy <= 0) {
        triggerHospitalization();
    }
}

function triggerInteractable(inter) {
    if (!inter) return;
    if (inter.type === 'BED') {
        triggerSleepSummary(false);
    } else if (inter.type === 'PC') {
        const wNext = getWeatherInfo(playerStats.tomorrowWeather);
        showToast(
            `📊 Hôm nay: ${dailyReport.revenue.toLocaleString('vi-VN')}đ (${dailyReport.cupsSold} ly) | 📡 Dự báo mai: ${wNext.icon} ${wNext.name}`,
            260
        );
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
    if (!npc.talkedToday) {
        npc.talkedToday = true;
        recordRelationshipDay(npc);
        npc.friendship = (npc.friendship || 0) + 20;
        checkNPCFriendshipMilestone(npc);
        recordChapterAction('talks');
        addScreenPopup(295, 458, "+20 ❤️ Thân thiết", "#e84393");
    }
}

function giftDrinkToActiveNPC(recipeIdx) {
    const npc = activeDialogueNPC;
    const recipe = GAME_CONFIG.RECIPES[recipeIdx];
    if (!npc || !recipe) return;
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
    addScreenPopup(520, 458, `+${pts} ❤️ (${recipe.name})`, isLoved ? "#e84393" : "#2ecc71");
    showToast(
        isBirthday
            ? `🎂 Quà sinh nhật cho ${npc.name}! (+${pts} điểm thân thiết)`
            : isLoved
            ? `💖 ${npc.name} cực kỳ thích [${recipe.name}]! (+${pts} điểm thân thiết)`
            : `🎁 Đã mời ${npc.name} ly [${recipe.name}] (+${pts} điểm thân thiết)`,
        190
    );
}

function getNPCDialogues(npc) {
    if (npc.briefingLines && npc.briefingLines.length) {
        return npc.briefingLines;
    }
    if (playerConfig.genderIndex === 1 && npc.dialoguesForFemalePlayer) {
        return npc.dialoguesForFemalePlayer;
    }
    return npc.dialogues || ["Chào bạn, chúc một ngày buôn bán đắt khách!"];
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
        const risk = [0.01, 0.06, 0.16, 0.02][index % 4];
        return [{
            npc, share: risk >= 0.15 ? 0.55 : risk >= 0.05 ? 0.40 : 0.28,
            risk: risk * (npc.friendship >= 450 ? 0.65 : 1),
            paperwork: risk >= 0.15 ? 'Đòi giữ tiền, giấy tờ thiếu' :
                risk >= 0.05 ? 'Cam kết miệng' : 'Có hợp đồng và biên nhận'
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
            const baseDaily = business.type.daily || (business.hasStaff ? 240000 : 0);
            const repFactor = getBusinessReputationFactor(business.type);
            const staffMult = business.hasStaff && business.type.daily ? 1.2 : 1;
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
    const keys = Object.keys(GAME_CONFIG.ZONES);
    const others = keys.filter((k) => k !== currentZone);
    return others.length ? others : keys;
}

function generateDeliveryOffers() {
    const targetZones = getDeliveryTargetZones();
    const curHour = Math.floor(playerStats.hour || 5);
    const offers = [];
    for (let i = 0; i < 3; i++) {
        const recipe = GAME_CONFIG.RECIPES[Math.floor(Math.random() * GAME_CONFIG.RECIPES.length)];
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
    showToast(`🛵 Nhận đơn: ${offer.cups} ${offer.recipeName} -> ${offer.zoneName} (trước ${offer.deadlineHour}:00)`);
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
    playerStats.money += activeDeliveryOrder.reward;
    dailyReport.cupsSold += activeDeliveryOrder.cups;
    dailyReport.revenue += activeDeliveryOrder.reward;
    deliveryCompletedToday += 1;
    const earnedRepToday = deliveryCompletedToday === 1;
    if (earnedRepToday) addCityReputation(1);
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
    pOutlinedRect(ctx, 170, 84, 660, 472, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.fillText("🛵 Nhận Đơn Giao Hàng Liên Khu [F]", 500, 120);
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
        ctx.fillText(`Thưởng: ${moneyLabel(o.reward)} ${repHint} · Hạn chót: ${o.deadlineHour}:00`, 500, 260);
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
                `Khách: ${offer.customerName} · Hạn: ${offer.deadlineHour}:00 · Cần: ☕${offer.coffeeNeed} 🥛${offer.milkNeed} 🍊${offer.fruitNeed}`,
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
        pOutlinedRect(ctx, 540, 496, 220, 38, "#f0b643");
        ctx.fillText("Đóng [Q / F]", 650, 520);
    } else {
        pOutlinedRect(ctx, 410, 496, 180, 38, "#f0b643");
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
        if(!draft.investigated){
            if(playerStats.money<50000){showToast("Cần 50.000đ hỏi thăm và kiểm tra giấy tờ.");return;}
            playerStats.money-=50000;draft.investigated=true;
            offer.risk=Math.max(0.01,offer.risk*0.35);offer.paperwork="Đã xác minh giấy tờ";
            showToast("Đã thẩm định đối tác. Rủi ro giảm mạnh.");
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
    if (coffeeCart.isPushed || !coffeeCart.isOpen || coffeeCart.zone !== currentZone || (currentZone === 'PARK' && getTodayFestival())) {
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
    marketInspector.animTimer++;
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

function switchZone(targetZone, newX, newY, newDir) {
    if (targetZone === 'PARK') activeVehicle = null;
    if (targetZone !== 'BREEZE_AREA') ridingBicycle = false;
    if (targetZone === 'PARK' && newDir === 'right') newY = 580;
    currentZone = targetZone;
    GameAudio?.playZoneSwitch();
    player.x = newX;
    player.y = newY;
    if (newDir) player.dir = newDir;
    if (coffeeCart.isPushed) {
        coffeeCart.zone = targetZone;
    } else if (!coffeeCart.seized && coffeeCart.zone === targetZone) {
        const seizeChance = (targetZone !== 'HOME_STREET' || coffeeCart.isOpen) ? 0.30 : 0.10;
        if (Math.random() < seizeChance) {
            seizeCoffeeCart(true);
        }
    }
    closeAllModals();
    updateCamera(true);
    const zInfo = GAME_CONFIG.ZONES[targetZone];
    if (zInfo) {
        showToast("📍 Đã đến: " + zInfo.name + " (Giá bán đồ uống x" + (zInfo.priceMultiplier || 1) + ")", 160);
    }
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

    if (currentGameState === GAME_STATES.WELCOME) {
        GameAudio?.playClick();
        currentGameState = GAME_STATES.MENU;
        return;
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
        if (mouseX >= 840 && mouseX <= 988 && mouseY >= 40 && mouseY <= 68) {
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
                    const bx = 532 + idx * 124;
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
        if (currentGameState === GAME_STATES.PLAYING_HOME &&
            mouseX >= wallCalendar.x && mouseX <= wallCalendar.x + wallCalendar.w &&
            mouseY >= wallCalendar.y && mouseY <= wallCalendar.y + wallCalendar.h) {
            openWallCalendar();
            return;
        }
        if (showNPCSchedule) {
            handleNPCScheduleClick(mouseX, mouseY);
            return;
        }
        if (mouseX >= 10 && mouseX <= 310 && mouseY >= 40 && mouseY <= 68) {
            openWallCalendar();
            return;
        }

        // 2. Click nút mở Bản Đồ Sơ Đồ [M] trên thanh HUD
        if (mouseX >= 324 && mouseX <= 450 && mouseY >= 4 && mouseY <= 30) {
            const nextState = !showMapModal;
            closeAllModals();
            showMapModal = nextState;
            return;
        }

        // 3. Click nút chỉnh tốc độ thời gian (1x / 2x) góc phải trên HUD
        if (mouseX >= 715 && mouseX <= 795 && mouseY >= 4 && mouseY <= 30) {
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
            if (currentZone === 'HOME_STREET' && Math.hypot(worldClickX - (vendorNPC.x + 18), worldClickY - (vendorNPC.y + 24)) < 46) {
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

        player.animTimer++;
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
let pendingScamReports = [];

function triggerStreetBriefingIfNeeded() {
    const chuTu = storyNPCs.find((n) => n.id === 'chu_tu');
    if (!chuTu) return;
    ensureChapterProgress();
    const lines = [];

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
    switchZone('HOME_STREET', 945, 445, 'down');
    nearbyInteractable = null;
    GameAudio?.playDoor();
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
            label: "💻 Máy Tính - Nhấn [E] để kiểm tra nhanh doanh thu trong ngày"
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
    if (!festival && coffeeCart.zone === currentZone && !coffeeCart.isPushed && coffeeCart.isOpen) {
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
    const upgradeBonus=activeSpots.some(s=>businesses[s.spotId]?.upgrades?.awning)?0.75:1;
    const cartSeatSpawnMult = (hasCartMobile && coffeeCart.seating) ? 0.88 : 1;
    const eventSpawnMult = getDailyEventSpawnMult(currentZone);
    const zoneCooldown = Math.round(baseCooldown * weatherMult * upgradeBonus * cartSeatSpawnMult * eventSpawnMult * (1-Math.min(0.2,customerReputation/500)));

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
                chosen.wantedRecipeIdx = chosen.isRegularOrder && Math.random() < 0.7
                    ? dailyRecipeIndex : Math.floor(Math.random() * GAME_CONFIG.RECIPES.length);
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
            } else {
                cust.dir = dx >= 0 ? 1 : -1;
                cust.x += (dx / dist) * cust.speed * dt;
                cust.y += (dy / dist) * cust.speed * dt;
            }
        } else if (cust.state === 'waiting_order') {
            if (!activeSpots.some((s) => s.spotId === cust.targetSpotId)) {
                cust.state = 'wandering';
                cust.targetSpotId = null;
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
            cust.animTimer++;
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
    vendorNPC.animTimer++;
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
            npc.animTimer++;
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

    // Kiểm tra đứng gần bất kỳ nhân vật nào (NPC có tên, khách đi dạo, cô hàng rong) để mở Hộp thoại
    if (!nearbyInteractable) {
        const talkables = [
            ...storyNPCs.filter((npc) => npc.meeting?.zone === currentZone && !npc.meeting.shop),
            ...streetCustomers,
            ...(currentZone === 'HOME_STREET' ? [vendorNPC] : [])
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
        switchZone(conn.left, WORLD_W - 85, player.y, 'left');
        return;
    }
    if (player.x >= WORLD_W - player.size - 24 && (keys.d || keys.ArrowRight) && conn.right) {
        switchZone(conn.right, 45, player.y, 'right');
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
        ['01', '10 KHU PHỐ'], ['02', '35 NHÂN VẬT'],
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

    // Nút đóng góc phải trên
    pOutlinedRect(ctx, 808, 104, 64, 30, '#e8c488');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#493437';
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText('Đóng [Q]', 840, 123);

    // Trang trái
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b3a2b';
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillText('📖 SỔ TAY KHỞI NGHIỆP 5AM', 136, 134);
    pRect(ctx, 136, 143, 336, 2, '#d9b98c');

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
            '• 1 / 2 / 3: Chọn nhanh món khi đang mở quầy',
            '• G: Đẩy hoặc đậu Xe Cà Phê 5AM',
            '• M: Sơ đồ khu phố  |  L: Lịch trình NPC',
            '• V: Garage xe  |  H: Bấm còi / Chuông xe',
            '• B: Mở/đóng Sổ tay  |  Q: Đóng bảng / Ra quán'
        ]}
    ];

    let ly = 172;
    leftLines.forEach((sec) => {
        ctx.fillStyle = '#5c382c';
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.fillText(sec.h, 136, ly);
        ly += 22;
        ctx.fillStyle = '#4a3a35';
        ctx.font = "13px 'Chakra Petch', sans-serif";
        sec.t.forEach((line) => {
            ctx.fillText(line, 136, ly);
            ly += 21;
        });
        ly += 14;
    });

    // Trang phải
    ctx.fillStyle = '#8b3a2b';
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillText('☕ THỂ LỆ & MẸO KINH DOANH', 524, 134);
    pRect(ctx, 524, 143, 270, 2, '#d9b98c');

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

    let ry = 166;
    rightLines.forEach((sec) => {
        ctx.fillStyle = '#5c382c';
        ctx.font = "bold 13.5px 'Chakra Petch', sans-serif";
        ctx.fillText(sec.h, 524, ry);
        ry += 20;
        ctx.fillStyle = '#4a3a35';
        ctx.font = "12.5px 'Chakra Petch', sans-serif";
        sec.t.forEach((line) => {
            ctx.fillText(line, 524, ry);
            ry += 19;
        });
        ry += 9;
    });
}

function drawSettingsModal() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, 'rgba(16, 15, 23, 0.78)');
    pRect(ctx, 252, 155, 500, 350, 'rgba(17, 13, 18, 0.48)');
    pOutlinedRect(ctx, 242, 145, 516, 354, '#e4b965');
    pOutlinedRect(ctx, 250, 153, 500, 338, '#f2dfbd');
    pRect(ctx, 262, 165, 476, 52, '#4d3941');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe3aa';
    ctx.font = "bold 23px 'Chakra Petch', sans-serif";
    ctx.fillText('CÀI ĐẶT', 500, 198);
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
    // 1. Cụm Tiền & Thể lực
    pOutlinedRect(ctx, 10, 4, 308, 28, "rgba(236, 211, 171, 0.95)");
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#963420";
    ctx.textAlign = "left";
    ctx.fillText("💰 " + playerStats.money.toLocaleString('vi-VN') + " đ", 20, 22);

    ctx.fillStyle = "#c84b31";
    ctx.fillText("⚡", 184, 22);
    pOutlinedRect(ctx, 204, 11, 104, 14, "#b5a496");
    const eColor = playerStats.energy > 30 ? "#4f8a46" : "#e74c3c";
    pRect(ctx, 206, 13, Math.max(0, (playerStats.energy / playerStats.maxEnergy) * 100), 10, eColor);

    // 2. Nút mở Sơ Đồ Khu Phố [M]
    pOutlinedRect(ctx, 324, 4, 126, 28, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🗺️ Sơ đồ [M]", 387, 22);

    // 3. Kho nguyên liệu pha chế hiện tại (Cà phê, Sữa, Trái cây)
    pOutlinedRect(ctx, 456, 4, 252, 28, "rgba(236, 211, 171, 0.95)");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
        `🫘 Cà phê: ${inventory.coffee}  |  🥫 Sữa: ${inventory.milk}  |  🍊 Cam: ${inventory.fruit}`,
        582,
        22
    );

    // 4. Nút đổi tốc độ thời gian (1x / 2x)
    pOutlinedRect(ctx, 714, 4, 82, 28, playerStats.timeSpeedMultiplier === 2 ? "#e67e22" : "#dfd1b4");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText("⏱️ Tốc độ " + playerStats.timeSpeedMultiplier + "x", 755, 22);

    // 5. Đồng hồ Năm / Ngày (100 ngày/năm) / Thời tiết & Giờ chuẩn Stardew Valley
    const wInfo = getWeatherInfo();
    pOutlinedRect(ctx, canvas.width - 198, 4, 188, 28, "rgba(236, 211, 171, 0.95)");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
        `${wInfo.icon} N${playerStats.year}•Ng${playerStats.dayOfYear}/100 ${formatGameClock(playerStats.hour)}`,
        canvas.width - 16,
        22
    );

    pOutlinedRect(ctx, 840, 40, 148, 28, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText("📖 Sổ tay [B]", 914, 59);

    pOutlinedRect(ctx, 10, 40, 300, 28, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillText(`🏅 Danh tiếng ${cityReputation}/100 · Chặng ${getNPCSchedulePhase() + 1}/4 · Mục tiêu`, 160, 59, 290);

    // 6. Nhãn vị trí góc dưới phải
    pOutlinedRect(ctx, canvas.width - 320, canvas.height - 38, 308, 30, "#ecd3ab");
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("📍 " + locationName, canvas.width - 20, canvas.height - 19);
}

// ============================================================================
// CÁC BẢNG MODAL TƯƠNG TÁC: CHỢ CÔ BA, PHA CHẾ CÀ PHÊ & NGỦ TỔNG KẾT NGÀY
// ============================================================================

function drawMarketModal() {
    if (!showMarketModal) return;
    const isEarly = playerStats.hour < GAME_CONFIG.TIME.EARLY_MARKET_BONUS_HOUR;

    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.76)");
    pOutlinedRect(ctx, 170, 80, 660, 480, "#ecd3ab");
    pOutlinedRect(ctx, 180, 90, 640, 460, "#fff6e5");

    pOutlinedRect(ctx, 180, 90, 640, 52, "#4f8a46");
    ctx.fillStyle = "#fff6e5";
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛒 SẠP TẠP HÓA CÔ BA - CHỢ SỚM HẺM 54", canvas.width / 2, 123);

    ctx.fillStyle = isEarly ? "#27ae60" : "#963420";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText(
        isEarly
            ? "🌅 ƯU ĐÃI DẬY SỚM 5AM: Đang giảm giá sỉ 20% tất cả nguyên liệu (Trước 08:00 Sáng)!"
            : "💡 Mẹo: Đi chợ từ 05:00 - 08:00 sáng mỗi ngày sẽ được Cô Ba giảm giá 20%!",
        canvas.width / 2,
        166
    );

    GAME_CONFIG.INGREDIENTS.forEach((item, idx) => {
        const rowY = 185 + idx * 72;
        const price = getMarketItemPrice(item);
        pOutlinedRect(ctx, 210, rowY, 580, 62, "#ecd3ab");

        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 16px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        const shelfLife = INGREDIENT_SHELF_LIFE[item.id];
        ctx.fillText(`${item.icon} ${item.name} (+${item.packAmount})`, 228, rowY + 25);
        if (shelfLife) {
            ctx.fillStyle = shelfLife === 1 ? "#c0392b" : "#8b5a2b";
            ctx.font = "bold 12px 'Chakra Petch', sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(`⏳ Hạn: ${shelfLife} ngày`, 620, rowY + 24);
            ctx.textAlign = "left";
        }

        ctx.fillStyle = "#4a3525";
        ctx.font = "13px 'Chakra Petch', sans-serif";
        ctx.fillText(item.desc, 228, rowY + 47);

        // Nút Mua
        const canBuy = playerStats.money >= price;
        pOutlinedRect(ctx, 635, rowY + 11, 140, 40, canBuy ? "#c84b31" : "#95a5a6");
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("MUA: " + price.toLocaleString('vi-VN') + "đ", 705, rowY + 36);
    });

    pOutlinedRect(ctx, 430, 492, 140, 42, "#2b1d16");
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
    GAME_CONFIG.INGREDIENTS.forEach((item, idx) => {
        const rowY = 185 + idx * 72;
        if (mx >= 635 && mx <= 775 && my >= rowY + 11 && my <= rowY + 51) {
            buyIngredientAtMarket(item);
        }
    });
}

function drawBrewModal() {
    if (!showBrewModal) return;
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const mult = (zInfo && zInfo.priceMultiplier ? zInfo.priceMultiplier : 1.0) * getDailyEventPriceMult(currentZone);
    const spotId = activeBrewSpot ? activeBrewSpot.spotId : null;
    const waitingHere = spotId ? getWaitingCustomersAtSpot(spotId) : [];

    // Menu nước thu gọn ở góc dưới bên phải (không che màn hình để nhìn rõ khách tới mua)
    const mx = 602;
    const my = 152;
    const mw = 384;
    const mh = 468;

    pRect(ctx, mx + 5, my + 5, mw, mh, "rgba(20, 14, 10, 0.45)");
    pOutlinedRect(ctx, mx, my, mw, mh, "#ecd3ab");
    pOutlinedRect(ctx, mx + 6, my + 6, mw - 12, mh - 12, "#fff6e5");

    // Header gọn + nút đóng [✖]
    pOutlinedRect(ctx, mx + 6, my + 6, mw - 12, 36, PAL.SIGN_RED);
    ctx.fillStyle = "#f0b643";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("☕ MENU PHA CHẾ (x" + Number(mult.toFixed(2)) + ")", mx + 18, my + 29);

    pOutlinedRect(ctx, mx + mw - 42, my + 10, 30, 28, "#2b1d16");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✖", mx + mw - 27, my + 29);

    // Thanh trạng thái khách đang gọi món
    pOutlinedRect(ctx, mx + 14, my + 48, mw - 28, 28, waitingHere.length > 0 ? "#e8f6e8" : "#fbeee6");
    ctx.fillStyle = waitingHere.length > 0 ? "#2e592c" : "#c0392b";
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    if (waitingHere.length > 0) {
        const rcp = GAME_CONFIG.RECIPES[waitingHere[0].wantedRecipeIdx];
        ctx.fillText("🙋 Khách gọi: " + rcp.icon + " " + rcp.name, mx + mw / 2, my + 67);
    } else {
        ctx.fillText("⏳ Đang chờ khách lại quầy gọi món...", mx + mw / 2, my + 67);
    }

    // Danh sách các món nước gọn gàng (6 món)
    GAME_CONFIG.RECIPES.forEach((rcp, idx) => {
        const rowY = my + 84 + idx * 58;
        const sellPrice = Math.round((rcp.baseSellPrice * mult) / 1000) * 1000;
        const hasIng = Object.entries(rcp.need).every(([k, v]) => (inventory[k] || 0) >= v);
        const isOrdered = waitingHere.some((c) => GAME_CONFIG.RECIPES[c.wantedRecipeIdx].id === rcp.id);

        pOutlinedRect(ctx, mx + 14, rowY, mw - 28, 52, isOrdered ? "#f7ebd2" : "#ecd3ab");

        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`[${idx + 1}] ${rcp.icon} ${rcp.name}`, mx + 22, rowY + 21);

        const ingTags = Object.entries(rcp.need).map(([k, v]) => {
            const ic = k === 'coffee' ? '🫘' : (k === 'milk' ? '🥫' : '🍊');
            return `${ic}${v}`;
        }).join(" ");
        ctx.fillStyle = "#5c4033";
        ctx.font = "11.5px 'Chakra Petch', sans-serif";
        ctx.fillText(`Cần: ${ingTags}  |  -${rcp.energyCost}⚡`, mx + 22, rowY + 41);

        let btnText = `BÁN +${(sellPrice / 1000)}k`;
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
        } else if (playerStats.energy < rcp.energyCost) {
            btnText = "CẠN ⚡!";
            btnColor = "#c84b31";
        }

        pOutlinedRect(ctx, mx + mw - 118, rowY + 8, 98, 36, btnColor);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11.5px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(btnText, mx + mw - 69, rowY + 31);
    });

    ctx.fillStyle = "#6e4736";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Nhấn phím [1]–[6] để pha nhanh | [Q] Đóng", mx + mw / 2, my + mh - 14);
}

function handleBrewModalClick(mx, my) {
    const panelX = 602;
    const panelY = 152;
    const panelW = 384;
    const panelH = 468;

    // Click ngoài bảng hoặc nút ✖ để đóng
    if (
        mx < panelX || mx > panelX + panelW || my < panelY || my > panelY + panelH ||
        (mx >= panelX + panelW - 42 && mx <= panelX + panelW - 12 && my >= panelY + 10 && my <= panelY + 38)
    ) {
        showBrewModal = false;
        return;
    }

    GAME_CONFIG.RECIPES.forEach((rcp, idx) => {
        const rowY = panelY + 84 + idx * 58;
        if (mx >= panelX + panelW - 118 && mx <= panelX + panelW - 20 && my >= rowY + 8 && my <= rowY + 44) {
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
    pOutlinedRect(ctx, 210, boxY, 580, boxH, "#ecd3ab");
    pOutlinedRect(ctx, 222, boxY + 12, 556, boxH - 24, "#fff6e5");

    pOutlinedRect(ctx, 222, boxY + 12, 556, 54, faintedInHospital ? "#7d2020" : "#2b1d16");
    ctx.fillStyle = faintedInHospital ? "#ffd7d7" : "#f0b643";
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
        faintedInHospital
            ? "🏥 NHẬP VIỆN CẤP CỨU - TỔNG KẾT NGÀY " + playerStats.day
            : "🌙 SỔ TAY TỔNG KẾT CUỐI NGÀY " + playerStats.day,
        canvas.width / 2,
        boxY + 47
    );

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
            const rcp = GAME_CONFIG.RECIPES[cust.wantedRecipeIdx];
            if (rcp) {
                pOutlinedRect(ctx, cust.x + 4, cust.y - 26, 28, 22, "#fff6e5");
                ctx.fillStyle = PAL.OUTLINE;
                ctx.font = "bold 12px 'Chakra Petch', sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(rcp.icon, cust.x + 18, cust.y - 10);
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
    pOutlinedRect(ctx, 220, 130, 560, 360, "#ecd3ab");
    pOutlinedRect(ctx, 230, 140, 540, 340, "#fff6e5");

    pOutlinedRect(ctx, 230, 140, 540, 48, PAL.SIGN_RED);
    ctx.fillStyle = "#f0b643";
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📋 HỒ SƠ MẶT BẰNG KINH DOANH", canvas.width / 2, 171);

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
    { id: 'BREEZE_AREA', label: 'KHU ĐÓN GIÓ', sub: 'Giá bán x1.5', x: 660, y: 415, w: 165, h: 74 }
];

function drawNPCSchedulePanel() {
    const phase = getNPCSchedulePhase();
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.78)");
    pOutlinedRect(ctx, 32, 70, 936, 510, "#ecd3ab");
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText("Lịch nhân vật", 54, 108);
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText(`Giai đoạn ${phase + 1}/4 · Ngày ${phase * 25 + 1}–${(phase + 1) * 25} · Hiện tại ${formatGameClock(playerStats.hour)}`, 54, 137);
    ctx.fillText("Đóng [L / Q]", 836, 108);

    npcScheduleZones.forEach((zone, index) => {
        const x = 54 + (index % 5) * 179;
        const y = 157 + Math.floor(index / 5) * 38;
        pOutlinedRect(ctx, x, y, 171, 32, zone === scheduleZone ? "#f0b643" : "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(GAME_CONFIG.ZONES[zone].name, x + 9, y + 21, 153);
    });

    npcRosters[scheduleZone].forEach((npc, index) => {
        const y = 255 + index * 51;
        pOutlinedRect(ctx, 54, y, 892, 45, "#fff3d6");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(npc.name, 66, y + 28, 215);
        const schedule = getNPCSchedule(scheduleZone, index);
        const width = Math.min(214, 642 / schedule.length);
        schedule.forEach(({ start, end, zone, spot, shop }, slot) => {
            const x = 294 + slot * width;
            if (playerStats.hour >= start && playerStats.hour < end) {
                pRect(ctx, x - 4, y + 5, width - 7, 35, "#f0b643");
            }
            ctx.fillStyle = PAL.OUTLINE;
            const startTime = String(start).padStart(2, '0') + ':00';
            const endTime = String(end).padStart(2, '0') + ':00';
            ctx.fillText(`${startTime}–${endTime}`, x, y + 16, width - 12);
            ctx.fillText(shop ? spot.label :
                `${GAME_CONFIG.ZONES[zone].name} · ${spot.label}`, x, y + 33, width - 12);
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
    pOutlinedRect(ctx, 35, 45, 930, 545, "#ecd3ab");
    pOutlinedRect(ctx, 45, 55, 910, 525, "#fff6e5");

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🗺️ SƠ ĐỒ CÁC KHU PHỐ & HỆ SỐ GIÁ BÁN (CLICK ĐỂ DI CHUYỂN NHANH)", canvas.width / 2, 92);

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

        if (isHere) {
            ctx.fillStyle = "#2ecc71";
            ctx.font = "bold 11px 'Chakra Petch', sans-serif";
            ctx.fillText("★ BẠN ĐANG Ở ĐÂY", node.x + node.w / 2, node.y - 6);
        }
    }

    pOutlinedRect(ctx, 845, 68, 92, 34, "#c84b31");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillText("ĐÓNG [M]", 891, 90);

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("💡 Đi bộ khám phá không gian rộng 2000x1400 hoặc nhấp vào ô trên sơ đồ để đi tàu điện/xe buýt tới ngay!", canvas.width / 2, 550);
}

function handleMapModalClick(mx, my) {
    if (mx >= 845 && mx <= 937 && my >= 68 && my <= 102) {
        showMapModal = false;
        return;
    }
    for (const node of MAP_NODES) {
        if (mx >= node.x && mx <= node.x + node.w && my >= node.y && my <= node.y + node.h) {
            showMapModal = false;
            if (node.id === 'PLAYING_HOME') {
                activeVehicle = null;
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

    const promptW = Math.min(760, Math.max(460, text.length * 8.2 + 44));
    pOutlinedRect(ctx, canvas.width / 2 - promptW / 2, 74, promptW, 34, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 96);
}

function calendarCell(index) {
    return { x: 61 + (index % 5) * 177, y: 151 + Math.floor(index / 5) * 70 };
}

function drawWallCalendar() {
    if (!showWallCalendar) return;
    const firstDay = getNPCSchedulePhase() * 25 + 1;
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(20, 14, 10, 0.78)");
    pOutlinedRect(ctx, 40, 62, 920, 540, "#ecd3ab");
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 23px 'Chakra Petch', sans-serif";
    ctx.fillText(`Năm ${playerStats.year} · Ngày ${firstDay}–${firstDay + 24}`, 61, 106);
    ctx.textAlign = "right";
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("Đóng [Q]", 935, 105);
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

    // Nhãn hướng dẫn Giường Ngủ & Cửa Ra Phố
    pOutlinedRect(ctx, 208, 104, 90, 22, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛏️ Ngủ [E]", 253, 119);

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
    ctx.fillText("💡 Ra phố mua nguyên liệu tại Chợ Cô Ba -> Pha cà phê bán ở Xe đẩy -> Tối về Giường nhấn [E] đi ngủ.", 26, canvas.height - 19);

    drawInteractionBanner();
    drawMinimalHUD("Nhà riêng | Hẻm 54");
    drawToastOverlay();
    drawMapModal();
    drawNPCSchedule();
    drawWallCalendar();
    drawTVModal();
    drawSleepSummaryModal();
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
    pOutlinedRect(ctx, 200, 120, 600, 400, "#5d4037");
    pOutlinedRect(ctx, 214, 134, 572, 372, "#fff5df");
    pRect(ctx, 224, 144, 552, 46, "#3a5a68");

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe3aa";
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.fillText("📺 BẢN TIN DỰ BÁO THỜI TIẾT SÀI GÒN", 500, 174);

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

function drawZoneAmbientEffectsInWorld() {
    if (currentZone === 'BREEZE_AREA') {
        const waveOffset = Math.sin(tickCount * 0.05) * 10;
        pRect(ctx, 0, 836 + waveOffset * 0.4, WORLD_W, 5, "rgba(255, 255, 255, 0.75)");
        drawBreezeSeasonDecorations();
        breezeCyclists.forEach((cy) => drawBicycleRider(cy));
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

    // Khách đi dạo và cư dân có lịch hẹn
    drawStreetCustomersInWorld();
    drawStoryNPCsInWorld();

    // Quầng sáng đèn đường ấm áp khi trời tối (>= 18:00)
    if (playerStats.hour >= 18.0) {
        [220, 640, 1140, 1620].forEach((lx) => {
            pRect(ctx, lx - 48, 455, 96, 65, "rgba(255, 214, 110, 0.18)");
            pRect(ctx, lx - 48, 670, 96, 65, "rgba(255, 214, 110, 0.18)");
        });
    }
}

function drawFloatingTextsInWorld() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= 0.6;
        ft.life--;
        ctx.fillStyle = ft.color;
        ctx.font = "bold 15px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y);
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawToastOverlay() {
    if (toastTimer > 0) {
        toastTimer--;
        const hasBanner = !isAnyModalOpen() && (nearbyInteractable || nearbyRental);
        const toastY = hasBanner ? 114 : 76;
        const tw = Math.min(820, toastMessage.length * 8.4 + 48);
        pOutlinedRect(ctx, canvas.width / 2 - tw / 2, toastY, tw, 34, "#2b1d16");
        pRect(ctx, canvas.width / 2 - tw / 2 + 2, toastY + 2, tw - 4, 30, "#fff3d6");
        ctx.fillStyle = "#c84b31";
        ctx.font = "bold 14px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(toastMessage, canvas.width / 2, toastY + 22);
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
        sp.y -= 0.65;
        sp.life--;
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
    pOutlinedRect(ctx, 236, 105, 528, 385, "#ecd3ab");
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText("Xe cá nhân", 500, 145);
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.fillText("Đóng [Q]", 722, 138);
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
    drawBitmapCharacter(player.x, player.y - 7, playerConfig, player.dir, 0, false, 1.3);
}

function drawStreet() {
    const festival = yearFestivals.find((event) => event.day === playerStats.dayOfYear && event.zone === currentZone);
    const bg = zoneCanvases[currentZone] || zoneCanvases.HOME_STREET;

    // 1. Vẽ thế giới mở 2000x1400 dịch chuyển theo Camera
    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    ctx.drawImage(bg, 0, 0);
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
        const top = shop.y + shop.h - 68;
        const isBBQ = shop.name.includes("NƯỚNG");
        const isParty = Boolean(shop.nightlife || isBBQ);
        const beat = Math.floor(performance.now() / (shop.nightlife ? 180 : 250));
        const palette = shop.nightlife
            ? ['#ff2e93', '#00e5ff', '#ffe600', '#b84dff']
            : ['#ff5722', '#ff9800', '#ffd54f', '#ff3d00'];
        const light = isParty ? palette[beat % palette.length] : (shop.food ? "#f0a257" : "#dfc37b");
        pOutlinedRect(ctx, left, top, shop.gateW, 68, "#2d2132");
        pRect(ctx, left + 4, top + 3, shop.gateW - 8, 4, light);
        pRect(ctx, left + 5, top + 48, shop.gateW - 10, 15, light);
        pRect(ctx, left + 8, top + 69, shop.gateW - 16, 10, isParty ? light : "rgba(245,185,104,0.35)");
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

    // 2. Lớp phủ ánh sáng Bình minh / Hoàng hôn / Đêm
    drawDayNightLightingOverlay();

    // 3. Giao diện HUD cố định trên màn hình
    const zInfo = GAME_CONFIG.ZONES[currentZone];
    const hasShip = hasDeliveryVehicle();
    pOutlinedRect(ctx, 14, canvas.height - 38, hasShip ? 745 : 675, 30, "#ecd3ab");
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText(
        hasShip
            ? "[E] Tương tác  |  [F] Ship hàng  |  [G] Xe cà phê  |  [V] Xe cá nhân  |  [M] Sơ đồ"
            : "[E] Tương tác  |  [G] Xe cà phê  |  [V] Xe cá nhân  |  [M] Sơ đồ",
        26,
        canvas.height - 19
    );

    if (activeDeliveryOrder) {
        const atTarget = currentZone === activeDeliveryOrder.zoneKey;
        pOutlinedRect(ctx, 14, 118, 320, 28, atTarget ? "#b6d6a0" : "#ffe6a7");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.font = "bold 12px 'Chakra Petch', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(
            `🛵 Ship: ${activeDeliveryOrder.cups}x ${activeDeliveryOrder.recipeName} → ${activeDeliveryOrder.zoneName} (<${activeDeliveryOrder.deadlineHour}:00)`,
            24,
            136,
            300
        );
    }

    drawInteractionBanner();
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
        ctx.font = "bold 11px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        const width = ctx.measureText(npc.name).width + 12;
        pOutlinedRect(ctx, npc.x + 18 - width / 2, npc.y - 16, width, 16, isDeliveryTarget ? "#ffe066" : "#ecd3ab");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.fillText(npc.name, npc.x + 18, npc.y - 4);
    });
}

function handleNPCDialogueClick(mouseX, mouseY) {
    if (mouseX >= 680 && mouseX <= 880 && mouseY >= 498 && mouseY <= 523 &&
        relationshipAction(activeDialogueNPC)) {
        handleRelationshipAction(activeDialogueNPC);
        return;
    }
    if (purchasedGifts.length && !activeDialogueNPC.giftedToday &&
        mouseX >= 680 && mouseX <= 880 && mouseY >= 530 && mouseY <= 557) {
        giftShopItem();
        return;
    }
    if (!activeDialogueNPC.giftedToday && mouseY >= 576 && mouseY <= 604) {
        for (let idx = 0; idx < GAME_CONFIG.RECIPES.length; idx++) {
            const bx = 315 + idx * 112;
            if (mouseX >= bx && mouseX <= bx + 106) {
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
    ctx.font = "14px 'Chakra Petch', sans-serif";
    const words = text.split(' ');
    let line = '';
    let ly = 526;
    const maxW = 635;
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        if (ctx.measureText(testLine).width > maxW && i > 0) {
            ctx.fillText(line.trim(), 244, ly);
            line = words[i] + ' ';
            ly += 18;
        } else {
            line = testLine;
        }
    }
    if (line.trim()) ctx.fillText(line.trim(), 244, ly);

    // Hàng nút Mời nước tăng điểm thân thiết (tối đa 1 lần/ngày)
    ctx.textAlign = "left";
    ctx.fillStyle = "#7a4424";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    if (npc.giftedToday) {
        ctx.fillText("✅ Hôm nay đã mời nước nhân vật này", 244, 594);
    } else {
        ctx.fillText("🎁 Mời nước:", 244, 594);
        GAME_CONFIG.RECIPES.forEach((rec, idx) => {
            const bx = 315 + idx * 112;
            const canMake = Object.entries(rec.need).every(([ing, amt]) => (inventory[ing] || 0) >= amt);
            pOutlinedRect(ctx, bx, 577, 106, 26, canMake ? "#f7d794" : "#dfd1b4");
            ctx.fillStyle = canMake ? PAL.OUTLINE : "#8a7c72";
            ctx.font = "bold 10px 'Chakra Petch', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${rec.icon} ${rec.name.replace("Cà Phê ", "CF ")}`, bx + 53, 594, 98);
        });
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#963420";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    if (purchasedGifts.length && !npc.giftedToday) {
        pOutlinedRect(ctx, 680, 530, 200, 27, "#f0b643");
        ctx.fillStyle = PAL.OUTLINE;
        ctx.textAlign = "center";
        ctx.fillText("Tặng " + purchasedGifts[0].name, 780, 548, 186);
        ctx.textAlign = "right";
    }
    const hint = (npc.dialogueIndex < dialogues.length - 1)
        ? "[Click / E: Tiếp ▶]"
        : "[Click / E: Đóng ✖]";
    ctx.fillText(hint, 886, 589);
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
    const w = playerConfig.name.length * 7.5 + 14;
    pOutlinedRect(ctx, cx - w / 2, cy - 13, w, 18, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.name, cx, cy);
}

function gameLoop(now = performance.now()) {
    const elapsedMs = Math.min(100, Math.max(1, now - lastFrameTime));
    lastFrameTime = now;
    dt = elapsedMs / 16.667;
    tickCount++;

    updateGameTime(elapsedMs / 1000);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentGameState === GAME_STATES.WELCOME) {
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
        if (indoorShop) {
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
            quote: b.quote,
            zone: b.zone,
            pending: Boolean(b.pending),
            opensDay: b.opensDay,
            upgrades: b.upgrades || {},
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
            repMilestoneClaimed: Boolean(n.repMilestoneClaimed)
        };
    });
    return {
        v: 1,
        playerConfig: {
            name: playerConfig.name,
            birthday: playerConfig.birthday,
            genderIndex: playerConfig.genderIndex,
            outfitIndex: playerConfig.outfitIndex,
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
        briefedStarter,
        briefedPhase,
        briefedEventDay,
        yearFestivals,
        dailyEventId: dailyEvent?.id || null,
        activeDeliveryOrder,
        deliveryCompletedToday
    };
}

function applySaveData(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.playerConfig) Object.assign(playerConfig, data.playerConfig);
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
                    partner: partnerNpc ? { npc: partnerNpc, share: b.partnerShare || 0.28 } : null,
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
    briefedStarter = Boolean(data.briefedStarter);
    briefedPhase = typeof data.briefedPhase === 'number' ? data.briefedPhase : -1;
    briefedEventDay = data.briefedEventDay || 0;
    if (Array.isArray(data.yearFestivals) && data.yearFestivals.length) yearFestivals = data.yearFestivals;
    dailyEvent = data.dailyEventId ? (DAILY_EVENTS.find((ev) => ev.id === data.dailyEventId) || null) : null;
    activeDeliveryOrder = data.activeDeliveryOrder || null;
    deliveryCompletedToday = data.deliveryCompletedToday || 0;
    deliveryOffers = [];

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

requestAnimationFrame(gameLoop);
