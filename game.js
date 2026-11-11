// game.js - Bộ điều khiển logic game 5AM
// Giữ nguyên 100% mạch truyện & bố cục Top-Down gốc + Nhân vật vẽ bằng Ma trận Điểm Ảnh (Pixel-by-Pixel Sprite) như ảnh tham khảo

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const nameInput = document.getElementById('playerNameInput');
const PAL = GAME_CONFIG.PALETTE;

const GAME_STATES = {
    MENU: 'MENU',
    CHARACTER_CREATION: 'CHARACTER_CREATION',
    INTRO: 'INTRO',
    PLAYING_HOME: 'PLAYING_HOME',
    PLAYING_STREET: 'PLAYING_STREET'
};

let currentGameState = GAME_STATES.MENU;

let playerConfig = {
    name: "Chủ Quán",
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

let introStep = 0;
let tickCount = 0;

let playerStats = {
    money: 20000000, // 20 Triệu VND vốn khởi nghiệp
    energy: 100,     // Thể lực tối đa 100
    hour: 5.0        // Bắt đầu lúc 05:00 sáng
};

let player = {
    x: 500,
    y: 325,
    size: 36,
    speed: 1.8, // Tốc độ đi bộ chậm rãi, chill chill
    dir: 'down',
    isMoving: false,
    animFrame: 0,
    animTimer: 0
};

let keys = {
    w: false, s: false, a: false, d: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
};

window.addEventListener('keydown', function (e) {
    if (document.activeElement === nameInput) return;
    if (e.key in keys) keys[e.key] = true;
    const low = e.key.toLowerCase();
    if (low in keys) keys[low] = true;
});

window.addEventListener('keyup', function (e) {
    if (e.key in keys) keys[e.key] = false;
    const low = e.key.toLowerCase();
    if (low in keys) keys[low] = false;
});

// Xe máy chạy ngang trên đường phố với nhịp độ chậm rãi buổi sáng sớm
let streetMotorbikes = [
    { x: 180, y: 265, speed: 1.1, dir: 1, bikeColor: "#dbd3c5", shirtColor: "#918c9e", hat: "nonla" },
    { x: 750, y: 385, speed: -1.25, dir: -1, bikeColor: "#7a3b32", shirtColor: "#8a99a6", hat: "helmet" },
    { x: 520, y: 265, speed: 0.95, dir: 1, bikeColor: "#4a5259", shirtColor: "#d6ccb8", hat: "none" }
];

// Cô gánh hàng rong đi bộ thong thả trên vỉa hè
let vendorNPC = {
    x: 580,
    y: 170,
    dir: 1,
    speed: 0.35,
    animFrame: 0,
    animTimer: 0
};

// ============================================================================
// HỆ THỐNG MA TRẬN ĐIỂM ẢNH NHÂN VẬT (24x35 PIXEL ART BITMAP - KHÔNG CÒN KHỐI VUÔNG)
// ============================================================================
// Ký hiệu điểm ảnh:
// '.' : Trong suốt
// 'O' : Viền nâu đen (#261914)
// 'H' : Tóc chính        | 'h' : Tóc bắt sáng
// 'S' : Da sáng          | 's' : Da bóng đổ (tai, cổ)
// 'E' : Mắt / Lông mày   | 'M' : Miệng
// 'T' : Áo chính         | 't' : Áo đổ bóng
// 'P' : Quần đùi chính   | 'p' : Quần đổ bóng
// 'K' : Giày chính       | 'k' : Đế giày sáng

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

// Vẽ nhân vật từ Ma trận Điểm Ảnh 24x35 (Hoàn toàn mềm mại, có tóc, tai, mắt, miệng, tay, chân, giày)
function drawBitmapCharacter(x, y, config, dir = 'down', animFrame = 0, isMoving = false, scale = 1.45) {
    const outfit = config.outfits[config.outfitIndex];
    const accType = config.accessories[config.accessoryIndex].type;
    const isFemale = (config.genderIndex === 1);

    // Chọn frame hoạt ảnh phù hợp
    let matrix = SPRITE_DOWN_IDLE;
    let flipX = false;

    if (dir === 'down') {
        if (isMoving && animFrame === 1) matrix = SPRITE_DOWN_WALK1;
        else if (isMoving && animFrame === 3) matrix = SPRITE_DOWN_WALK2;
        else matrix = SPRITE_DOWN_IDLE;
    } else if (dir === 'up') {
        matrix = SPRITE_UP_IDLE;
    } else if (dir === 'right') {
        matrix = (isMoving && (animFrame === 1 || animFrame === 3)) ? SPRITE_SIDE_WALK1 : SPRITE_SIDE_IDLE;
    } else if (dir === 'left') {
        matrix = (isMoving && (animFrame === 1 || animFrame === 3)) ? SPRITE_SIDE_WALK1 : SPRITE_SIDE_IDLE;
        flipX = true;
    }

    const colorMap = {
        'O': '#261914',
        'H': isFemale ? '#4a2818' : '#261d1a',
        'h': isFemale ? '#6e3f28' : '#42332e',
        'S': '#f2b488',
        's': '#d99568',
        'E': '#1f1511',
        'M': '#96422c',
        'T': outfit.color,
        't': outfit.shadow,
        'P': outfit.shorts,
        'p': '#1e242b',
        'K': '#4a413b',
        'k': '#8c827a'
    };

    const bobY = (isMoving && (animFrame === 1 || animFrame === 3)) ? -1 : 0;

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (scale !== 1) ctx.scale(scale, scale);

    // 1. Bóng tròn mềm dưới chân nhân vật
    pRect(ctx, 4, 32, 16, 4, "rgba(43, 29, 22, 0.38)");
    pRect(ctx, 6, 31, 12, 6, "rgba(43, 29, 22, 0.25)");

    // 2. Nếu là Nữ: Vẽ thêm đuôi tóc dài mềm mại hai bên vai
    if (isFemale) {
        pRect(ctx, 3, 9 + bobY, 18, 7, '#261914');
        pRect(ctx, 4, 10 + bobY, 16, 5, '#4a2818');
    }

    // 3. Quét và vẽ từng điểm ảnh trong ma trận 24x35
    for (let r = 0; r < matrix.length; r++) {
        const rowStr = matrix[r];
        for (let c = 0; c < rowStr.length; c++) {
            const ch = rowStr[c];
            if (ch === '.') continue;
            const col = colorMap[ch];
            if (!col) continue;
            const drawCol = flipX ? (23 - c) : c;
            // Khi đi bộ hướng UP, nhấc chân luân phiên
            let legShift = 0;
            if (dir === 'up' && isMoving && r >= 27) {
                if (animFrame === 1 && c < 12) legShift = -2;
                if (animFrame === 3 && c >= 12) legShift = -2;
            }
            pRect(ctx, drawCol, r + bobY + legShift, 1, 1, col);
        }
    }

    // 4. Vẽ phụ kiện Nón bo tròn theo pixel (Nón kết / Nón tai bèo)
    if (accType === "cap") {
        // Nón kết đỏ bo tròn có lưỡi trai
        pRect(ctx, 6, 0 + bobY, 12, 1, '#261914');
        pRect(ctx, 5, 1 + bobY, 14, 4, '#261914');
        pRect(ctx, 6, 1 + bobY, 12, 3, '#c84b31');
        pRect(ctx, 8, 1 + bobY, 6, 1, '#e0674e');
        // Lưỡi trai theo hướng nhìn
        const visorX = (dir === 'left') ? 2 : (dir === 'right' ? 8 : 4);
        const visorW = (dir === 'left' || dir === 'right') ? 14 : 16;
        pRect(ctx, visorX, 4 + bobY, visorW, 3, '#261914');
        pRect(ctx, visorX + 1, 4 + bobY, visorW - 2, 2, '#963420');
    } else if (accType === "hat") {
        // Nón tai bèo vành rộng bo cong
        pRect(ctx, 6, -1 + bobY, 12, 2, '#261914');
        pRect(ctx, 5, 0 + bobY, 14, 4, '#261914');
        pRect(ctx, 6, 0 + bobY, 12, 3, '#7a9674');
        pRect(ctx, 2, 3 + bobY, 20, 3, '#261914');
        pRect(ctx, 3, 3 + bobY, 18, 2, '#5f7a61');
    }

    ctx.restore();
}

// ============================================================================
// HÀM TIỆN ÍCH VẼ BỐI CẢNH PIXEL ART
// ============================================================================

function pRect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pOutlinedRect(c, x, y, w, h, fillColor, outlineColor = PAL.OUTLINE) {
    pRect(c, x, y, w, h, outlineColor);
    pRect(c, x + 2, y + 2, w - 4, h - 4, fillColor);
}

// Ma trận điểm ảnh Chậu Cây Cảnh Đất Nung (22x26) - Tán lá xòe tự nhiên & chậu bo tròn như ảnh mẫu
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
    pRect(c, startX + 3 * scale, startY + 24 * scale, 14 * scale, 3 * scale, "rgba(43, 29, 22, 0.38)");
    for (let r = 0; r < PLANT_BITMAP.length; r++) {
        const row = PLANT_BITMAP[r];
        for (let col = 0; col < row.length; col++) {
            const ch = row[col];
            if (ch === '.') continue;
            pRect(c, startX + col * scale, startY + r * scale, Math.ceil(scale), Math.ceil(scale), pal[ch]);
        }
    }
}

// Ma trận điểm ảnh Xe Máy Sài Gòn (Honda Cub / Wave - 28x18) - Bánh tròn, bửng cong, yên đôi, ống pô
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

// Vẽ tường vữa cổ điển Sài Gòn có độ loang màu, vết rêu phong & mảng tróc vữa lộ gạch
function drawWeatheredWall(c, x, y, w, h, baseCol, darkCol, lightCol) {
    pOutlinedRect(c, x, y, w, h, baseCol);
    pRect(c, x + 2, y + 2, w - 4, 6, darkCol);
    for (let py = y + 8; py < y + h - 8; py += 10) {
        for (let px = x + 6; px < x + w - 12; px += 14) {
            const seed = (px * 17 + py * 31) % 17;
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

// Vẽ mái ngói vảy cá / ngói ống Sài Gòn xếp lớp có chiều sâu 2.5D
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
}

function drawFoldingGate(c, x, y, w, h, gateColor = PAL.SHUTTER_GREEN, darkColor = PAL.SHUTTER_DARK) {
    pOutlinedRect(c, x, y, w, h, "#2b241f");
    pOutlinedRect(c, x + 2, y + 2, w - 4, h - 2, gateColor);
    for (let gx = x + 6; gx < x + w - 6; gx += 7) {
        pRect(c, gx, y + 4, 2, h - 6, darkColor);
        pRect(c, gx + 3, y + 4, 2, h - 6, PAL.OUTLINE);
        const mid1 = y + Math.floor(h * 0.32);
        const mid2 = y + Math.floor(h * 0.65);
        pRect(c, gx - 2, mid1, 5, 2, "#859e87");
        pRect(c, gx - 2, mid1 + 3, 5, 2, PAL.OUTLINE);
        pRect(c, gx - 2, mid2, 5, 2, "#859e87");
        pRect(c, gx - 2, mid2 + 3, 5, 2, PAL.OUTLINE);
    }
}

// Vẽ mái hiên bạt xếp kẻ sọc có viền lượn sóng vỏ sò (Scalloped Wavy Awning) chuẩn ảnh mẫu
function drawStripedAwning(c, x, y, w, h, col1, col2) {
    pRect(c, x + 3, y + h + 2, w - 4, 8, "rgba(43, 29, 22, 0.35)");
    const stripeW = 12;
    for (let sx = x; sx < x + w; sx += stripeW) {
        const curW = Math.min(stripeW, x + w - sx);
        const isEven = Math.floor((sx - x) / stripeW) % 2 === 0;
        const mainCol = isEven ? col1 : col2;
        pRect(c, sx, y, curW, h - 4, PAL.OUTLINE);
        pRect(c, sx + 1, y + 2, curW - 1, h - 6, mainCol);
        pRect(c, sx + 1, y + h - 4, curW - 1, 5, PAL.OUTLINE);
        pRect(c, sx + 2, y + h - 4, Math.max(1, curW - 3), 3, mainCol);
        pRect(c, sx + 3, y + h - 1, Math.max(1, curW - 5), 2, PAL.OUTLINE);
    }
    pRect(c, x, y, 2, h, PAL.OUTLINE);
    pRect(c, x + w - 2, y, 2, h, PAL.OUTLINE);
}

function drawShutteredWindow(c, x, y, w, h, frameCol = "#8c5230", shutterCol = "#5f7a61") {
    pOutlinedRect(c, x - 3, y - 5, w + 6, 6, "#d9c2a3");
    pRect(c, x - 1, y + h + 2, w + 4, 4, "rgba(43, 29, 22, 0.3)");
    pOutlinedRect(c, x - 2, y + h - 2, w + 4, 6, "#c7b198");
    pOutlinedRect(c, x, y, w, h, "#2b1e18");
    const halfW = Math.floor((w - 6) / 2);
    pOutlinedRect(c, x + 2, y + 2, halfW, h - 4, shutterCol);
    pOutlinedRect(c, x + 4 + halfW, y + 2, halfW, h - 4, shutterCol);
    for (let wy = y + 6; wy < y + h - 5; wy += 4) {
        pRect(c, x + 5, wy, halfW - 6, 2, frameCol);
        pRect(c, x + 7 + halfW, wy, halfW - 6, 2, frameCol);
    }
}

// ============================================================================
// CACHE NỀN PHÒNG NGỦ (HOME) & NỀN PHỐ TOP-DOWN (STREET)
// ============================================================================

const homeBgCanvas = document.createElement('canvas');
homeBgCanvas.width = canvas.width;
homeBgCanvas.height = canvas.height;
const homeBgCtx = homeBgCanvas.getContext('2d');
homeBgCtx.imageSmoothingEnabled = false;

const streetBgCanvas = document.createElement('canvas');
streetBgCanvas.width = canvas.width;
streetBgCanvas.height = canvas.height;
const streetBgCtx = streetBgCanvas.getContext('2d');
streetBgCtx.imageSmoothingEnabled = false;

function buildHomeBackground() {
    const c = homeBgCtx;
    pRect(c, 0, 0, canvas.width, canvas.height, "#1f1611");
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

    // Nội thất gốc: Giường, Tủ lạnh, Bàn máy tính, Cửa ra phố
    pRect(c, 104, 106, 94, 132, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 100, 100, 92, 132, "#6e4736");
    pOutlinedRect(c, 106, 108, 80, 116, "#c84b31");
    pOutlinedRect(c, 112, 112, 68, 34, "#ecd3ab");
    pOutlinedRect(c, 106, 154, 80, 70, "#d99b4e");

    pRect(c, 814, 106, 74, 102, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 810, 100, 72, 100, PAL.WALL_MINT);
    pRect(c, 812, 140, 68, 4, PAL.OUTLINE);
    pRect(c, 818, 118, 4, 16, PAL.OUTLINE);
    pRect(c, 818, 150, 4, 22, PAL.OUTLINE);

    pRect(c, 104, 326, 56, 84, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 100, 320, 54, 82, "#8c5d47");
    pOutlinedRect(c, 106, 330, 42, 52, "#333942");
    pOutlinedRect(c, 112, 342, 30, 26, "#58a6ff");

    pOutlinedRect(c, 230, 100, 110, 52, "#8c5d47");
    pOutlinedRect(c, 250, 110, 18, 22, PAL.CART_STEEL);
    pOutlinedRect(c, 280, 112, 16, 20, "#4f8a46");
    drawTerracottaPlant(c, 770, 130);

    pOutlinedRect(c, 440, 526, 120, 30, "#b85d38");
    pOutlinedRect(c, 430, 558, 140, 16, PAL.SHUTTER_GREEN);
    for (let dx = 438; dx < 564; dx += 10) {
        pRect(c, dx, 560, 3, 12, PAL.OUTLINE);
    }
}

function buildStreetBackground() {
    const c = streetBgCtx;

    // 1. Nền vỉa hè lát gạch đá hoài cổ có vết nứt & độ chuyển màu tự nhiên như ảnh mẫu
    pRect(c, 0, 0, canvas.width, canvas.height, PAL.SIDEWALK_LIGHT);
    for (let y = 0; y < canvas.height; y += 26) {
        for (let x = 0; x < canvas.width; x += 34) {
            const shade = ((x / 34 + y / 26) % 3 === 0) ? PAL.SIDEWALK_MID : PAL.SIDEWALK_LIGHT;
            pRect(c, x, y, 34, 26, shade);
            pRect(c, x, y, 34, 2, "#87776a");
            pRect(c, x, y, 2, 26, "#87776a");
            // Điểm xuyết vài viên gạch sẫm màu tạo nét cổ kính
            if ((x * 7 + y * 13) % 11 === 0) {
                pRect(c, x + 2, y + 2, 30, 22, "#948375");
            }
        }
    }

    // Bóng đổ dài của dãy nhà phố xuống mặt vỉa hè phía trên
    pRect(c, 40, 178, 920, 16, "rgba(43, 29, 22, 0.22)");

    // 2. Lòng đường nhựa ngang qua phố
    pOutlinedRect(c, 40, 212, 920, 10, "#c7b8aa");
    pOutlinedRect(c, 40, 478, 920, 10, "#c7b8aa");
    pOutlinedRect(c, 40, 220, 920, 260, PAL.ROAD_ASPHALT);
    pRect(c, 42, 222, 916, 12, PAL.ROAD_DARK);
    pRect(c, 42, 466, 916, 12, PAL.ROAD_DARK);

    for (let x = 65; x < 935; x += 64) {
        pOutlinedRect(c, x, 346, 38, 9, PAL.ROAD_LINE);
    }

    const drawDrain = (dx, dy) => {
        pOutlinedRect(c, dx, dy, 44, 18, "#4a3b31");
        for (let gx = dx + 6; gx < dx + 38; gx += 6) {
            pRect(c, gx, dy + 4, 3, 10, "#241a14");
        }
    };
    drawDrain(280, 222);
    drawDrain(610, 222);
    drawDrain(450, 460);

    // ========================================================================
    // 3. DÃY NHÀ ỐNG SÀI GÒN 2.5D LIỀN KỀ (CÓ VÁCH HÔNG 3D, MÁI NGÓI VẢY CÁ, TƯỜNG LOANG, MÁI HIÊN LƯỢN SÓNG)
    // ========================================================================

    const drawBuilding3DSide = (bx, by, bh, sideW, colWall) => {
        c.fillStyle = colWall;
        c.beginPath();
        c.moveTo(bx - sideW, by + 10);
        c.lineTo(bx, by);
        c.lineTo(bx, by + bh);
        c.lineTo(bx - sideW, by + bh - 6);
        c.closePath();
        c.fill();
        c.strokeStyle = PAL.OUTLINE;
        c.lineWidth = 2;
        c.stroke();
    };

    // --- CĂN PHỤ GÓC TRÁI (x=38..94, y=38..188) ---
    drawWeatheredWall(c, 38, 38, 58, 150, "#d9a76a", "#b88449", "#ebbf88");
    drawTiledRoof(c, 36, 28, 60, 14);
    drawShutteredWindow(c, 48, 58, 36, 38, "#5c3c24", "#7a5234");
    drawStripedAwning(c, 36, 110, 60, 22, PAL.AWNING_GREEN, PAL.AWNING_CREAM);
    drawFoldingGate(c, 44, 130, 46, 58, PAL.SHUTTER_GREEN, PAL.SHUTTER_DARK);

    // --- NHÀ 2: CHO THUÊ MẶT BẰNG (x=96, y=32, w=222, h=158) ---
    drawBuilding3DSide(96, 32, 158, 10, "#9e6b3b");
    drawWeatheredWall(c, 96, 32, 222, 158, PAL.WALL_OCHRE, PAL.WALL_OCHRE_DARK, "#f2c994");
    pOutlinedRect(c, 94, 28, 226, 7, "#b87939");
    pOutlinedRect(c, 110, 38, 86, 34, "#6e4736"); // Hốc ban công âm
    pOutlinedRect(c, 138, 41, 50, 28, "#a86b3c");
    pOutlinedRect(c, 108, 62, 90, 11, "#d9a262");
    drawTerracottaPlant(c, 122, 60, 1.1);
    pOutlinedRect(c, 210, 40, 94, 30, "#595e56");
    pOutlinedRect(c, 214, 44, 41, 22, "#8c9489");
    pOutlinedRect(c, 259, 44, 41, 22, "#8c9489");

    // ĐẠI BẢNG HIỆU ĐỎ - VÀNG: "CHO THUÊ MẶT BẰNG - Ho Chi Minh City"
    pRect(c, 106, 78, 210, 62, "rgba(43, 29, 22, 0.38)");
    pOutlinedRect(c, 102, 74, 210, 60, PAL.SIGN_YELLOW);
    pOutlinedRect(c, 108, 79, 198, 39, PAL.SIGN_RED);
    pRect(c, 112, 83, 3, 3, "#f0b643");
    pRect(c, 300, 83, 3, 3, "#f0b643");
    pOutlinedRect(c, 108, 132, 198, 13, "#3b6e8c");
    pOutlinedRect(c, 108, 143, 198, 47, "#c95232");
    pOutlinedRect(c, 142, 147, 130, 43, "#6d7568");
    pRect(c, 148, 151, 56, 35, "#7e8778");
    pRect(c, 210, 151, 56, 35, "#7e8778");
    pRect(c, 158, 155, 4, 24, "#9aa393");
    pRect(c, 220, 155, 4, 24, "#9aa393");
    pRect(c, 206, 147, 3, 43, PAL.OUTLINE);
    pRect(c, 199, 162, 3, 12, "#ecd3ab");
    pRect(c, 212, 162, 3, 12, "#ecd3ab");
    pOutlinedRect(c, 116, 156, 16, 20, "#f0b643");
    pOutlinedRect(c, 282, 154, 18, 15, "#dfd3be");
    pOutlinedRect(c, 174, 187, 66, 10, "#8a8f87");
    for (let rx = 180; rx < 236; rx += 8) pRect(c, rx, 190, 4, 4, "#595e56");

    c.fillStyle = "#fff3d6";
    c.font = "bold 15px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText("🏠 CHO THUÊ MẶT BẰNG", 207, 99);
    c.fillStyle = "#f0b643";
    c.font = "bold 11px 'Chakra Petch', sans-serif";
    c.fillText("Ho Chi Minh City", 207, 113);

    // --- CĂN PHỐ KẾ BÊN (x=318..416): Nhà ống 2 tầng vàng nghệ + Ban công nhô 3D ---
    drawBuilding3DSide(318, 34, 156, 8, "#8c5d32");
    drawWeatheredWall(c, 318, 34, 98, 156, PAL.WALL_GOLD, "#b57835", "#f0ba75");
    pOutlinedRect(c, 314, 28, 106, 9, "#9e6324");
    drawShutteredWindow(c, 346, 44, 42, 42, "#6e3d1e", "#94562b");
    drawShutteredWindow(c, 324, 48, 16, 28, "#3d2618", "#5c3c24");
    drawShutteredWindow(c, 394, 48, 16, 28, "#3d2618", "#5c3c24");
    pRect(c, 318, 102, 98, 6, "rgba(43, 29, 22, 0.38)");
    pOutlinedRect(c, 316, 80, 102, 23, "#c98842");
    pOutlinedRect(c, 346, 76, 42, 20, "#c2ccb8");
    drawTerracottaPlant(c, 330, 80, 1.2);
    drawTerracottaPlant(c, 404, 80, 1.2);
    drawStripedAwning(c, 318, 106, 98, 22, PAL.AWNING_GREEN, "#5d7858");
    drawFoldingGate(c, 326, 128, 82, 62, PAL.SHUTTER_GREEN, PAL.SHUTTER_DARK);

    // --- NHÀ 1: NHÀ CỦA TÔI - HẺM 54 (x=416, y=30, w=168, h=160) ---
    drawBuilding3DSide(416, 30, 160, 9, "#8c6d53");
    drawWeatheredWall(c, 416, 30, 168, 160, PAL.WALL_CREAM, "#cfb28a", "#fff3dc");
    drawTiledRoof(c, 412, 22, 176, 24, PAL.ROOF_TILE_LIGHT, PAL.ROOF_TILE_DARK);
    drawShutteredWindow(c, 476, 50, 48, 38, "#754626", "#a86b3c");
    drawShutteredWindow(c, 432, 54, 32, 26, "#4a3020", "#6e4736");
    drawShutteredWindow(c, 536, 54, 32, 26, "#4a3020", "#6e4736");
    pRect(c, 418, 104, 164, 6, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 416, 80, 168, 26, "#e3d6c1");
    pOutlinedRect(c, 414, 77, 172, 6, "#f5ead8");
    for (let bx = 424; bx < 576; bx += 7) {
        pRect(c, bx, 84, 4, 18, "#4f7a63");
        pRect(c, bx + 1, 86, 2, 14, "#74a38a");
    }
    drawTerracottaPlant(c, 432, 79, 1.2);
    drawTerracottaPlant(c, 568, 79, 1.2);
    drawStripedAwning(c, 418, 106, 164, 22, "#d9c2a3", "#bda282");
    drawFoldingGate(c, 434, 128, 132, 62, "#7a6352", "#4f3d30");
    pOutlinedRect(c, 466, 132, 68, 58, "#241914");
    pOutlinedRect(c, 562, 136, 20, 14, "#29568f");
    c.fillStyle = "#ffffff";
    c.font = "bold 9px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText("54", 572, 146);

    pOutlinedRect(c, 452, 103, 96, 20, "#ecd3ab");
    c.fillStyle = PAL.OUTLINE;
    c.font = "bold 12px 'Chakra Petch', sans-serif";
    c.fillText("Nhà của tôi", 500, 117);

    // --- CĂN PHỐ KẾ BÊN (x=584..676): Nhà kem ban công bo tròn + mái hiên xanh ---
    drawBuilding3DSide(584, 34, 156, 8, "#9e8565");
    drawWeatheredWall(c, 584, 34, 92, 156, "#ebd5b3", "#cfb58f", "#faf0df");
    drawTiledRoof(c, 582, 26, 96, 18);
    drawShutteredWindow(c, 602, 48, 56, 36, "#3d5240", "#5f7a61");
    pRect(c, 584, 102, 92, 6, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 582, 80, 96, 24, "#dfc39d");
    drawTerracottaPlant(c, 630, 79, 1.2);
    drawStripedAwning(c, 584, 106, 92, 22, PAL.AWNING_GREEN, "#9cb396");
    drawFoldingGate(c, 592, 128, 76, 62, PAL.SHUTTER_GREEN, PAL.SHUTTER_DARK);

    // --- NHÀ 3: MẶT BẰNG NGÃ TƯ (x=676, y=30, w=234, h=160) ---
    drawBuilding3DSide(676, 30, 160, 9, "#8c5d32");
    drawWeatheredWall(c, 676, 30, 234, 160, PAL.WALL_GOLD, "#b87b38", "#f2be7e");
    drawTiledRoof(c, 672, 22, 242, 20, "#9c6244", "#6e422c");
    drawShutteredWindow(c, 698, 46, 44, 38, "#5c341d", "#94562b");
    drawShutteredWindow(c, 766, 46, 54, 38, "#394d3b", "#5f7a61");
    drawShutteredWindow(c, 842, 46, 44, 38, "#5c341d", "#94562b");
    pRect(c, 676, 104, 234, 6, "rgba(43, 29, 22, 0.35)");
    pOutlinedRect(c, 674, 80, 238, 26, "#c98842");
    for (let bx = 684; bx < 902; bx += 8) {
        pRect(c, bx, 84, 3, 18, "#3b2618");
        pRect(c, bx - 1, 90, 5, 3, "#e5a93c");
    }
    drawTerracottaPlant(c, 754, 79, 1.2);
    drawTerracottaPlant(c, 892, 79, 1.2);
    drawStripedAwning(c, 676, 106, 234, 24, PAL.AWNING_GREEN, PAL.AWNING_CREAM);
    drawFoldingGate(c, 690, 130, 206, 60, PAL.SHUTTER_GREEN, PAL.SHUTTER_DARK);
    pOutlinedRect(c, 712, 146, 162, 30, "#fff3d6");
    c.fillStyle = PAL.SIGN_RED;
    c.font = "bold 13px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText("🏢 MẶT BẰNG NGÃ TƯ", 793, 166);

    // --- CĂN PHỤ GÓC PHẢI TRÊN (x=910..960) ---
    drawWeatheredWall(c, 910, 36, 50, 154, "#d4ab79", "#b08858", "#e8c599");
    drawTiledRoof(c, 908, 28, 54, 16);
    drawStripedAwning(c, 908, 110, 52, 22, "#c97b4b", "#a86238");

    // --- TIỆM TẠP HÓA / CHỢ Ở GÓC DƯỚI PHỐ (x=660, y=496, w=280, h=124) ---
    pRect(c, 666, 504, 284, 120, "rgba(43, 29, 22, 0.35)");
    drawBuilding3DSide(660, 498, 122, 10, "#9e774b");
    drawWeatheredWall(c, 660, 498, 280, 122, "#d4ab79", "#b38959", "#ebd5b3");
    drawTiledRoof(c, 656, 480, 288, 20, PAL.ROOF_TILE_LIGHT, PAL.ROOF_TILE_DARK);
    drawStripedAwning(c, 656, 470, 94, 26, "#8a5a75", "#70465e");
    drawStripedAwning(c, 748, 466, 96, 26, "#67859c", "#506a7d");
    drawStripedAwning(c, 842, 470, 98, 26, "#c97b4b", "#a86238");

    // Các rổ hàng đan tre chất đầy rau củ, trứng, cam tươi (vẽ từng chùm/quả tròn)
    const drawFruitBasket = (bx, by, fruitCol1, fruitCol2) => {
        pRect(c, bx + 2, by + 24, 52, 6, "rgba(43, 29, 22, 0.35)");
        pOutlinedRect(c, bx, by + 8, 52, 20, "#a6754b");
        pRect(c, bx + 4, by + 14, 44, 2, "#7d5432");
        pRect(c, bx + 4, by + 20, 44, 2, "#7d5432");
        for (let fx = bx + 4; fx < bx + 44; fx += 9) {
            pOutlinedRect(c, fx, by, 10, 10, (fx % 2 === 0) ? fruitCol1 : fruitCol2);
            pOutlinedRect(c, fx + 3, by - 5, 9, 8, fruitCol1);
        }
    };
    drawFruitBasket(676, 518, "#7bb357", "#599949");
    drawFruitBasket(740, 518, "#fff8eb", "#ecd3ab");
    drawFruitBasket(804, 518, "#e88a38", "#f0b643");
    drawFruitBasket(868, 518, "#87b853", "#589e47");

    pOutlinedRect(c, 710, 568, 180, 28, "#f0b643");
    c.fillStyle = PAL.OUTLINE;
    c.font = "bold 13px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText("🛒 TIỆM TẠP HÓA (CHỢ)", 800, 587);

    // 4. Chi tiết đường phố Sài Gòn: Cột điện bình hạ thế, Chậu cây Bitmap, Xe máy Bitmap, Xe đẩy CÀ PHÊ
    pOutlinedRect(c, 58, 45, 10, 155, "#8c8782");
    pOutlinedRect(c, 72, 45, 10, 155, "#8c8782");
    pOutlinedRect(c, 46, 58, 48, 8, "#59544f");
    pOutlinedRect(c, 50, 82, 20, 36, "#787d82");
    pOutlinedRect(c, 70, 86, 18, 34, "#686d73");

    drawTerracottaPlant(c, 96, 188, 1.45);
    drawTerracottaPlant(c, 318, 188, 1.45);
    drawTerracottaPlant(c, 416, 188, 1.45);
    drawTerracottaPlant(c, 584, 188, 1.45);
    drawTerracottaPlant(c, 676, 188, 1.45);
    drawTerracottaPlant(c, 910, 188, 1.45);

    drawParkedScooter(c, 114, 178, "#3e6b89", true, 1.5, false);
    drawParkedScooter(c, 256, 178, "#b84b39", false, 1.5, true);
    drawParkedScooter(c, 608, 178, "#bd5738", true, 1.5, false);

    // Xe đẩy inox "CÀ PHÊ" & Ghế đẩu gỗ trên vỉa hè
    pOutlinedRect(c, 112, 542, 20, 8, "#b87939");
    pOutlinedRect(c, 114, 548, 5, 12, "#7d4c27");
    pOutlinedRect(c, 125, 548, 5, 12, "#7d4c27");
    pRect(c, 138, 562, 76, 10, "rgba(43, 29, 22, 0.4)");
    pOutlinedRect(c, 140, 526, 72, 38, "#b8bfc4");
    pOutlinedRect(c, 140, 496, 72, 32, "rgba(220, 230, 235, 0.65)");
    pRect(c, 175, 498, 2, 28, PAL.OUTLINE);
    pOutlinedRect(c, 138, 490, 76, 10, "#c8cfd4");
    pOutlinedRect(c, 148, 512, 12, 14, "#a66c38");
    pOutlinedRect(c, 164, 512, 12, 14, "#d99b4e");
    pOutlinedRect(c, 182, 512, 12, 14, "#c84b31");
    pOutlinedRect(c, 144, 556, 14, 14, "#262626");
    pRect(c, 148, 560, 6, 6, "#b8bfc4");
    pOutlinedRect(c, 194, 556, 14, 14, "#262626");
    pRect(c, 198, 560, 6, 6, "#b8bfc4");
    c.fillStyle = PAL.OUTLINE;
    c.font = "bold 11px 'Chakra Petch', sans-serif";
    c.textAlign = "center";
    c.fillText("CÀ PHÊ", 176, 549);

    pOutlinedRect(c, 580, 518, 32, 44, "#4c7a57");
    pOutlinedRect(c, 577, 512, 38, 8, "#3b6144");
    pRect(c, 592, 534, 8, 8, "#dfe6e9");
    pRect(c, 594, 536, 4, 4, "#4c7a57");
}

buildHomeBackground();
buildStreetBackground();

// ============================================================================
// SỰ KIỆN CLICK CHUỘT
// ============================================================================

canvas.addEventListener('click', function (event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;

    if (currentGameState === GAME_STATES.MENU) {
        if (mouseX >= 400 && mouseX <= 600 && mouseY >= 370 && mouseY <= 440) {
            currentGameState = GAME_STATES.CHARACTER_CREATION;
        }
    } else if (currentGameState === GAME_STATES.CHARACTER_CREATION) {
        if (mouseY >= 230 && mouseY <= 265) {
            if (mouseX >= 490 && mouseX <= 530) {
                playerConfig.genderIndex = (playerConfig.genderIndex - 1 + playerConfig.genders.length) % playerConfig.genders.length;
            } else if (mouseX >= 690 && mouseX <= 730) {
                playerConfig.genderIndex = (playerConfig.genderIndex + 1) % playerConfig.genders.length;
            }
        }
        if (mouseY >= 300 && mouseY <= 335) {
            if (mouseX >= 490 && mouseX <= 530) {
                playerConfig.outfitIndex = (playerConfig.outfitIndex - 1 + playerConfig.outfits.length) % playerConfig.outfits.length;
            } else if (mouseX >= 690 && mouseX <= 730) {
                playerConfig.outfitIndex = (playerConfig.outfitIndex + 1) % playerConfig.outfits.length;
            }
        }
        if (mouseY >= 370 && mouseY <= 405) {
            if (mouseX >= 490 && mouseX <= 530) {
                playerConfig.accessoryIndex = (playerConfig.accessoryIndex - 1 + playerConfig.accessories.length) % playerConfig.accessories.length;
            } else if (mouseX >= 690 && mouseX <= 730) {
                playerConfig.accessoryIndex = (playerConfig.accessoryIndex + 1) % playerConfig.accessories.length;
            }
        }
        if (mouseX >= 380 && mouseX <= 620 && mouseY >= 470 && mouseY <= 530) {
            let customName = nameInput.value.trim();
            if (customName !== "") {
                playerConfig.name = customName;
            }
            nameInput.style.display = 'none';
            currentGameState = GAME_STATES.INTRO;
            introStep = 0;
        }
    } else if (currentGameState === GAME_STATES.INTRO) {
        introStep++;
        if (introStep > 1) {
            currentGameState = GAME_STATES.PLAYING_HOME;
            player.x = 500;
            player.y = 325;
        }
    }
});

// ============================================================================
// CẬP NHẬT DI CHUYỂN TRONG NHÀ & NGOÀI PHỐ
// ============================================================================

function updatePlayerMovement(minX, maxX, minY, maxY) {
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
        player.x += (dx / len) * player.speed;
        player.y += (dy / len) * player.speed;

        if (player.x < minX) player.x = minX;
        if (player.x > maxX - player.size) player.x = maxX - player.size;
        if (player.y < minY) player.y = minY;
        if (player.y > maxY - player.size) player.y = maxY - player.size;

        player.animTimer++;
        if (player.animTimer >= 16) {
            player.animFrame = (player.animFrame + 1) % 4;
            player.animTimer = 0;
        }
    } else {
        player.isMoving = false;
        player.animFrame = 0;
    }
}

function updateHome() {
    updatePlayerMovement(84, 916, 86, 560);

    // Ra cửa bước ra phố
    if (player.y >= 510 && player.x >= 430 && player.x <= 570) {
        currentGameState = GAME_STATES.PLAYING_STREET;
        player.x = 484;
        player.y = 160;
        player.dir = 'down';
    }
}

function updateStreet() {
    updatePlayerMovement(44, 956, 140, 595);

    streetMotorbikes.forEach((b) => {
        b.x += b.speed;
        if (b.dir > 0 && b.x > 1050) b.x = -80;
        if (b.dir < 0 && b.x < -80) b.x = 1050;
    });

    vendorNPC.x += vendorNPC.speed * vendorNPC.dir;
    if (vendorNPC.x > 650) vendorNPC.dir = -1;
    if (vendorNPC.x < 350) vendorNPC.dir = 1;
    vendorNPC.animTimer++;
    if (vendorNPC.animTimer >= 24) {
        vendorNPC.animFrame = (vendorNPC.animFrame + 1) % 4;
        vendorNPC.animTimer = 0;
    }

    // Đi vào khu vực "Nhà của tôi" (phía trên giữa) để về nhà
    if (player.y <= 148 && player.x >= 440 && player.x <= 550 && (keys.w || keys.ArrowUp)) {
        currentGameState = GAME_STATES.PLAYING_HOME;
        player.x = 484;
        player.y = 490;
        player.dir = 'up';
    }
}

// ============================================================================
// CÁC HÀM VẼ MÀN HÌNH
// ============================================================================

function drawMenu() {
    ctx.drawImage(streetBgCanvas, 0, 0);
    pRect(ctx, 0, 0, canvas.width, canvas.height, "rgba(28, 20, 16, 0.65)");

    pOutlinedRect(ctx, 260, 115, 480, 205, "#ecd3ab");
    pOutlinedRect(ctx, 272, 127, 456, 181, PAL.SIGN_RED);

    ctx.fillStyle = "#f0b643";
    ctx.font = "bold 74px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("5AM", canvas.width / 2, 220);

    ctx.fillStyle = "#fff3d6";
    ctx.font = "bold 23px 'Chakra Petch', sans-serif";
    ctx.fillText("Khởi Nghiệp Cà Phê Hẻm", canvas.width / 2, 278);

    pOutlinedRect(ctx, 400, 370, 200, 70, PAL.SIGN_YELLOW);
    pOutlinedRect(ctx, 406, 376, 188, 58, "#d65a38");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillText("BẮT ĐẦU", canvas.width / 2, 413);
}

function drawCharacterCreation() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, "#241a14");
    pOutlinedRect(ctx, 90, 20, 820, 560, "#ecd3ab");
    pOutlinedRect(ctx, 102, 32, 796, 536, PAL.WALL_OCHRE);

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 28px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TÙY CHỈNH CHỦ QUÁN", canvas.width / 2, 68);

    // Khung xem trước nhân vật
    pOutlinedRect(ctx, 150, 160, 140, 280, PAL.SIDEWALK_LIGHT);
    pRect(ctx, 154, 375, 132, 6, PAL.OUTLINE);

    // Vẽ nhân vật bằng Ma trận Điểm Ảnh phóng to 4.2x rõ từng đường nét bo tròn
    drawBitmapCharacter(169, 224, playerConfig, 'down', Math.floor(tickCount / 26) % 4, true, 4.2);

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Xem trước", 220, 425);

    ctx.font = "bold 18px 'Chakra Petch', sans-serif";

    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("Giới tính:", 340, 250);
    drawArrowButton(510, 245, "<");
    pOutlinedRect(ctx, 532, 227, 156, 36, "#fff3d6");
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.genders[playerConfig.genderIndex], 610, 250);
    drawArrowButton(710, 245, ">");

    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("Trang phục:", 340, 320);
    drawArrowButton(510, 315, "<");
    pOutlinedRect(ctx, 532, 297, 156, 36, "#fff3d6");
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.outfits[playerConfig.outfitIndex].name, 610, 320);
    drawArrowButton(710, 315, ">");

    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("Phụ kiện:", 340, 390);
    drawArrowButton(510, 385, "<");
    pOutlinedRect(ctx, 532, 367, 156, 36, "#fff3d6");
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.accessories[playerConfig.accessoryIndex].name, 610, 390);
    drawArrowButton(710, 385, ">");

    pOutlinedRect(ctx, 380, 470, 240, 60, "#4f8a46");
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VÀO KHỞI NGHIỆP", canvas.width / 2, 506);
}

function drawIntro() {
    pRect(ctx, 0, 0, canvas.width, canvas.height, "#161210");

    pOutlinedRect(ctx, 220, 110, 560, 290, "#242936");
    pOutlinedRect(ctx, 250, 380, 500, 150, "#8c5d47");
    pOutlinedRect(ctx, 256, 386, 488, 24, "#a86b3c");

    pOutlinedRect(ctx, 430, 260, 140, 90, "#333942");
    pOutlinedRect(ctx, 438, 268, 124, 74, "#58a6ff");
    pOutlinedRect(ctx, 485, 350, 30, 34, "#333942");

    if (introStep === 0) {
        ctx.fillStyle = "#ecd3ab";
        ctx.font = "bold 18px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Văn phòng công ty lúc 23:45 Đêm...", canvas.width / 2, 75);

        drawBitmapCharacter(464, 295, playerConfig, 'down', 0, false, 3.0);

        drawSpeechBubble(
            canvas.width / 2,
            180,
            playerConfig.name + " mệt mỏi: \"Lại tăng ca... Đến khi nào mới hết cái vòng luẩn quẩn này...\""
        );
    } else if (introStep === 1) {
        let shakeX = (Math.random() - 0.5) * 6;
        let shakeY = (Math.random() - 0.5) * 6;

        ctx.save();
        ctx.translate(shakeX, shakeY);

        ctx.fillStyle = "#e74c3c";
        ctx.font = "bold 24px 'Chakra Petch', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("💥 TỨC NƯỚC VỠ BỜ! 💥", canvas.width / 2, 75);

        drawBitmapCharacter(460, 248, playerConfig, 'down', 1, true, 3.3);

        drawSpeechBubble(
            canvas.width / 2,
            150,
            "\"" + playerConfig.name + " không thể sống với lương ba cộc ba đồng này nữa, phải khởi nghiệp thôi!\""
        );

        ctx.restore();
    }

    ctx.fillStyle = "#b5a496";
    ctx.font = "15px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("[Nhấp chuột để tiếp tục]", canvas.width / 2, 600);
}

function drawSpeechBubble(x, y, text) {
    let boxWidth = Math.min(920, Math.max(480, text.length * 8.8 + 44));
    pOutlinedRect(ctx, x - boxWidth / 2, y - 28, boxWidth, 58, "#fff3d6");

    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 6);
}

function drawArrowButton(x, y, text) {
    pOutlinedRect(ctx, x - 16, y - 16, 32, 32, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 6);
}

function drawMinimalHUD(locationName) {
    // Thanh HUD thu gọn sát mép trên (cao 26px) để không che khuất mái ngói và ban công lầu 2
    pOutlinedRect(ctx, 14, 4, 305, 26, "rgba(236, 211, 171, 0.94)");
    ctx.font = "bold 14px 'Chakra Petch', sans-serif";

    ctx.fillStyle = "#963420";
    ctx.textAlign = "left";
    let formattedMoney = playerStats.money.toLocaleString('vi-VN') + " đ";
    ctx.fillText("💰 " + formattedMoney, 24, 22);

    ctx.fillStyle = "#c84b31";
    ctx.fillText("⚡", 192, 22);
    pOutlinedRect(ctx, 212, 11, 96, 12, "#b5a496");
    pRect(ctx, 214, 13, Math.max(0, playerStats.energy * 0.92), 8, "#4f8a46");

    let timeString = "05:00 SÁNG";
    let iconSky = "☀️";
    if (playerStats.hour >= 18 || playerStats.hour < 6) {
        iconSky = "🌙";
    }
    pOutlinedRect(ctx, canvas.width - 164, 4, 150, 26, "rgba(236, 211, 171, 0.94)");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "right";
    ctx.fillText(iconSky + " " + timeString, canvas.width - 24, 22);

    pOutlinedRect(ctx, canvas.width - 235, canvas.height - 40, 215, 30, "#ecd3ab");
    ctx.fillStyle = PAL.SIGN_RED;
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("📍 " + locationName, canvas.width - 30, canvas.height - 20);
}

function drawHome() {
    ctx.drawImage(homeBgCanvas, 0, 0);

    pOutlinedRect(ctx, 438, 532, 124, 22, "#f0b643");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🚪 Cửa ra phố", 500, 547);

    pOutlinedRect(ctx, 80, canvas.height - 40, 410, 30, "#ecd3ab");
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("Dùng phím W, A, S, D hoặc Mũi tên để di chuyển.", 94, canvas.height - 20);

    // Vẽ nhân vật bằng Ma trận Điểm Ảnh 24x35 (Scale 1.5x)
    drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
    drawPlayerNameLabel();

    drawMinimalHUD("Nhà riêng | Hẻm 54");
}

function drawStreet() {
    ctx.drawImage(streetBgCanvas, 0, 0);

    drawVendorOnSidewalk(vendorNPC.x, vendorNPC.y);
    streetMotorbikes.forEach((b) => drawMovingBikeTopDown(b));

    // Vẽ nhân vật bằng Ma trận Điểm Ảnh 24x35 (Scale 1.5x)
    drawBitmapCharacter(player.x, player.y, playerConfig, player.dir, player.animFrame, player.isMoving, 1.5);
    drawPlayerNameLabel();

    ctx.strokeStyle = PAL.OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(68, 92);
    ctx.quadraticCurveTo(250, 114, 420, 88);
    ctx.quadraticCurveTo(560, 108, 680, 88);
    ctx.stroke();

    pOutlinedRect(ctx, 40, canvas.height - 40, 500, 30, "#ecd3ab");
    ctx.font = "bold 13px 'Chakra Petch', sans-serif";
    ctx.fillStyle = PAL.OUTLINE;
    ctx.textAlign = "left";
    ctx.fillText("Di chuyển tự do trên vỉa hè - Khám phá các mặt bằng cho thuê!", 55, canvas.height - 20);

    drawMinimalHUD("Khu phố hẻm | Sài Gòn");
}

function drawVendorOnSidewalk(x, y) {
    // Vẽ cô gánh hàng rong bằng dáng người bo tròn + nón lá + đôi thúng đan tròn
    const bob = (vendorNPC.animFrame % 2 === 1) ? -1 : 0;
    pRect(ctx, x - 12, y + 38, 28, 5, "rgba(43, 29, 22, 0.38)");

    // Đòn gánh tre uốn cong & 2 thúng tre bo tròn (không phải hộp vuông)
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

    // Dáng người cô gánh hàng rong (dùng chung tỉ lệ nhân vật bo tròn)
    const vendorCfg = {
        genderIndex: 1,
        outfitIndex: 0,
        outfits: [{ color: "#7d5a78", shadow: "#593e55", shorts: "#2e2927" }],
        accessoryIndex: 0,
        accessories: [{ type: "none" }]
    };
    drawBitmapCharacter(x - 11, y - 4, vendorCfg, vendorNPC.dir > 0 ? 'right' : 'left', vendorNPC.animFrame, true, 1.15);

    // Nón lá truyền thống đội trên đầu cô gánh hàng rong
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
    // Vẽ xe máy bằng ma trận điểm ảnh 28x18 (Honda Cub/Wave bánh tròn, yếm trắng, bô xe) thay vì 3 khối chữ nhật
    drawParkedScooter(ctx, x, y + 8, b.bikeColor, true, 1.5, b.dir < 0);

    // Người lái xe máy vẽ bằng ma trận nhân vật thu nhỏ ngồi trên yên
    const riderCfg = {
        genderIndex: 0,
        outfitIndex: 0,
        outfits: [{ color: b.shirtColor, shadow: "#59544f", shorts: "#2e3136" }],
        accessoryIndex: 0,
        accessories: [{ type: b.hat === "helmet" ? "cap" : "none" }]
    };
    drawBitmapCharacter(x + 9, y - 15, riderCfg, b.dir > 0 ? 'right' : 'left', 0, false, 1.05);
}

function drawPlayerNameLabel() {
    const cx = player.x + 18;
    const cy = player.y - 10;
    const w = playerConfig.name.length * 7.5 + 14;
    pOutlinedRect(ctx, cx - w / 2, cy - 13, w, 18, "#ecd3ab");
    ctx.fillStyle = PAL.OUTLINE;
    ctx.font = "bold 12px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(playerConfig.name, cx, cy);
}

function gameLoop() {
    tickCount++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentGameState === GAME_STATES.MENU) {
        if (nameInput) nameInput.style.display = 'none';
        drawMenu();
    } else if (currentGameState === GAME_STATES.CHARACTER_CREATION) {
        if (nameInput) nameInput.style.display = 'block';
        drawCharacterCreation();
    } else if (currentGameState === GAME_STATES.INTRO) {
        if (nameInput) nameInput.style.display = 'none';
        drawIntro();
    } else if (currentGameState === GAME_STATES.PLAYING_HOME) {
        if (nameInput) nameInput.style.display = 'none';
        updateHome();
        drawHome();
    } else if (currentGameState === GAME_STATES.PLAYING_STREET) {
        if (nameInput) nameInput.style.display = 'none';
        updateStreet();
        drawStreet();
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();
