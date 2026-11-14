// constants.js - Cấu hình cốt lõi & Bảng màu Pixel Art Sài Gòn Hoài Cổ (5AM)
const GAME_CONFIG = {
    TITLE: "5AM",
    SUBTITLE: "Khởi Nghiệp Cà Phê Hẻm Sài Gòn",
    CANVAS_WIDTH: 1000,
    CANVAS_HEIGHT: 650,
    WORLD_WIDTH: 2000,
    WORLD_HEIGHT: 1400,
    PIXEL_SIZE: 2,

    // Hệ thống thời gian & cơ chế ngày/đêm (Cân bằng theo chuẩn Stardew Valley)
    // - 10 phút trong game = 5 giây ngoài đời (1 giờ game = 30 giây ngoài đời)
    // - 1 ngày từ 05:00 Sáng -> 24:00 Đêm (19 giờ game) = 9 phút 30 giây ngoài đời
    TIME: {
        WAKE_UP_HOUR: 5.0,               // Giờ thức dậy mặc định (05:00 sáng)
        EARLY_MARKET_BONUS_HOUR: 8.0,    // Đi chợ trước 08:00 sáng được giảm giá sỉ 20%
        SUNSET_START_HOUR: 16.5,         // Hoàng hôn bắt đầu lúc 16:30
        MARKET_CLOSE_HOUR: 18.5,         // Chợ đóng cửa lúc 18:30
        NIGHT_START_HOUR: 18.5,          // Phố lên đèn lúc 18:30
        SLEEP_PENALTY_LIMIT: 24.0,       // Thức tới 24:00 (00:00 đêm) sẽ tự động ngất/buộc đi ngủ
        LATE_WAKE_UP_HOUR: 8.0,          // Giờ thức dậy muộn nếu hôm trước thức quá khuya
        REAL_SECONDS_PER_GAME_HOUR: 30,  // 30 giây ngoài đời = 1 giờ trong game (1 ngày = 9.5 phút)
        DAYS_PER_YEAR: 100               // 1 năm gồm 100 ngày Sài Gòn
    },
    WEATHER: {
        SUNNY: {
            id: 'SUNNY',
            name: 'Nắng Đẹp',
            icon: '☀️',
            outdoorCartCooldownMult: 1.0,
            indoorShopCooldownMult: 1.0,
            preferredDrink: 'caphe_sua',
            desc: 'Trời quang đãng, khách dạo phố đều đặn.'
        },
        HOT: {
            id: 'HOT',
            name: 'Nắng Gắt',
            icon: '🔥',
            outdoorCartCooldownMult: 0.78,
            indoorShopCooldownMult: 0.72,
            preferredDrink: 'bac_xiu',
            desc: 'Trời oi bức! Khách rất thèm đồ uống mát lạnh.'
        },
        RAIN: {
            id: 'RAIN',
            name: 'Mưa Rào',
            icon: '🌧️',
            outdoorCartCooldownMult: 1.65,
            indoorShopCooldownMult: 0.90,
            preferredDrink: 'caphe_den',
            desc: 'Mưa Sài Gòn bất chợt! Xe vỉa hè vắng hơn, quán có mái che vẫn ổn.'
        },
        STORM: {
            id: 'STORM',
            name: 'Bão Lớn',
            icon: '⛈️',
            outdoorCartCooldownMult: 2.6,
            indoorShopCooldownMult: 1.15,
            preferredDrink: 'tra_dao',
            desc: 'Gió giật mưa to! Khách ngại đứng ngoài trời, chỉ vào quán trú mưa.'
        }
    },

    // Trạng thái màn hình game (Game States)
    STATES: {
        MENU: 'MENU',
        CHARACTER_CREATION: 'CHARACTER_CREATION',
        INTRO: 'INTRO',
        PLAYING_HOME: 'PLAYING_HOME',
        PLAYING_STREET: 'PLAYING_STREET'
    },

    // Danh sách nguyên liệu tại Tiệm Tạp Hóa Cô Ba (Chợ sớm)
    INGREDIENTS: [
        {
            id: 'coffee',
            name: 'Hạt Cà Phê Rang Mộc',
            icon: '🫘',
            packAmount: 5,
            basePrice: 45000,
            desc: 'Gói 5 phần pha cà phê phin đậm đà hương vị Sài Gòn.'
        },
        {
            id: 'milk',
            name: 'Sữa Đặc Ngọt Ngào',
            icon: '🥫',
            packAmount: 5,
            basePrice: 35000,
            desc: 'Lon 5 phần pha Cà phê sữa đá & Bạc xỉu béo ngậy.'
        },
        {
            id: 'fruit',
            name: 'Trái Cây & Cam Sả Tươi',
            icon: '🍊',
            packAmount: 5,
            basePrice: 50000,
            desc: 'Rổ 5 phần pha Trà đào cam sả & Nước trái cây nhiệt đới.'
        },
        {
            id: 'banhmi',
            name: 'Bánh Mì Sài Gòn Giòn Nóng',
            icon: '🥖',
            packAmount: 1,
            basePrice: 20000,
            energyRestore: 38,
            desc: 'Ăn ngay tại chỗ để hồi phục +38 Thể lực làm việc.'
        }
    ],

    // Thực đơn đồ uống bán cho khách
    RECIPES: [
        {
            id: 'ca_phe_den',
            name: 'Cà Phê Đen Đá',
            icon: '☕',
            need: { coffee: 1 },
            baseSellPrice: 22000,
            energyCost: 4,
            desc: 'Cà phê phin truyền thống tỉnh táo tức thì (Cần: 1 Cà phê)'
        },
        {
            id: 'bac_xiu',
            name: 'Bạc Xỉu Hẻm Sài Gòn',
            icon: '🥛',
            need: { coffee: 1, milk: 1 },
            baseSellPrice: 35000,
            energyCost: 5,
            desc: 'Sữa nóng quyện chút cà phê thơm lừng (Cần: 1 Cà phê + 1 Sữa)'
        },
        {
            id: 'tra_cam_sa',
            name: 'Trà Cam Sả Nhiệt Đới',
            icon: '🍹',
            need: { coffee: 1, fruit: 1 },
            baseSellPrice: 42000,
            energyCost: 5,
            desc: 'Thanh mát giải nhiệt ngày nắng Sài Gòn (Cần: 1 Cà phê + 1 Trái cây)'
        }
    ],

    // Danh sách 10 khu phố theo sơ đồ kết nối của người chơi (Bản đồ mở rộng 2000x1400)
    ZONES: {
        BETTER_STREET: {
            id: 'BETTER_STREET',
            name: 'Khu Phố Đắt Hơn',
            subtitle: 'Phố Thịnh Vượng | Khu Dân Cư Khá Giả',
            connections: { right: 'HOME_STREET', up: 'VILLAS', down: 'CANAL_MARKET' },
            priceRange: '8.5 - 11 Triệu/tháng',
            priceMultiplier: 1.25
        },
        VILLAS: {
            id: 'VILLAS', name: 'Khu Biệt Thự', subtitle: 'Nhà vườn và hàng cây',
            connections: { down: 'BETTER_STREET', right: 'OFFICE_DISTRICT' }, priceMultiplier: 1.55
        },
        CANAL_MARKET: {
            id: 'CANAL_MARKET', name: 'Chợ Kênh', subtitle: 'Chợ sáng và đường dạo ven kênh',
            connections: { up: 'BETTER_STREET', right: 'DISTRICT_1' }, priceMultiplier: 1.1
        },
        HOME_STREET: {
            id: 'HOME_STREET',
            name: 'Khu Phố Nhà Mình',
            subtitle: 'Khu Phố Hẻm 54 | Bình Dân & Chợ Sớm',
            connections: { left: 'BETTER_STREET', right: 'DOWNTOWN', upHome: 'PLAYING_HOME' },
            priceRange: '4.5 - 6.5 Triệu/tháng',
            priceMultiplier: 1.0
        },
        DOWNTOWN: {
            id: 'DOWNTOWN',
            name: 'Trung Tâm Sầm Uất',
            subtitle: 'Đại Lộ Mua Sắm | Thời Trang & Showroom Xe',
            connections: { left: 'HOME_STREET', right: 'PARK', up: 'OFFICE_DISTRICT', down: 'DISTRICT_1' },
            priceRange: '22 - 30 Triệu/tháng',
            priceMultiplier: 1.85
        },
        OFFICE_DISTRICT: {
            id: 'OFFICE_DISTRICT',
            name: 'Khu Văn Phòng',
            subtitle: 'Phố Tài Chính & Cao Ốc Công Sở',
            connections: { down: 'DOWNTOWN', right: 'ELDERLY_AREA', left: 'VILLAS' },
            priceRange: '17.5 - 24 Triệu/tháng',
            priceMultiplier: 1.65
        },
        DISTRICT_1: {
            id: 'DISTRICT_1',
            name: 'Quận 1',
            subtitle: 'Phố Đêm Giải Trí | Club, Lounge & Ẩm Thực Đêm',
            connections: { up: 'DOWNTOWN', right: 'BREEZE_AREA', left: 'CANAL_MARKET' },
            priceRange: '28 - 35 Triệu/tháng',
            priceMultiplier: 2.1
        },
        PARK: {
            id: 'PARK',
            name: 'Công Viên',
            subtitle: 'Sân chơi, đường dạo và quảng trường lễ hội',
            connections: { left: 'DOWNTOWN', up: 'ELDERLY_AREA', down: 'BREEZE_AREA' },
            priceMultiplier: 1.4
        },
        ELDERLY_AREA: {
            id: 'ELDERLY_AREA',
            name: 'Khu Người Già',
            subtitle: 'Phố Cổ Hoa Giấy | Yên Tĩnh, Cổ Kính & Đắt Giá',
            connections: { down: 'PARK', left: 'OFFICE_DISTRICT' },
            priceRange: '16 - 21 Triệu/tháng',
            priceMultiplier: 1.6
        },
        BREEZE_AREA: {
            id: 'BREEZE_AREA',
            name: 'Khu Đón Gió',
            subtitle: 'Đường Ven Biển | Đạp Xe & Hóng Gió Biển',
            connections: { up: 'PARK', left: 'DISTRICT_1' },
            priceRange: '14 Triệu/tháng',
            priceMultiplier: 1.5
        }
    },

    // Danh sách mặt bằng cho thuê tại từng khu vực (tọa độ thoáng đãng trên bản đồ 2000x1400 kiểu Stardew Valley)
    RENTALS: {
        HOME_STREET: [
            {
                id: 'rent_home_1',
                name: 'Mặt Bằng Hẻm 54',
                price: 4500000,
                area: '18m²',
                traffic: '★★☆☆☆',
                customerType: 'Hàng xóm trong hẻm, công nhân, người đi chợ sớm',
                desc: 'Căn nhà nhỏ có khoảng sân thoáng ngay gần nhà mình, chi phí thấp, an toàn khởi nghiệp.',
                x: 280, y: 250, w: 230, h: 175, doorX: 395, doorY: 445
            },
            {
                id: 'rent_home_2',
                name: 'Mặt Bằng Ngã Tư Hẻm',
                price: 6500000,
                area: '26m²',
                traffic: '★★★☆☆',
                customerType: 'Khách qua lại đầu hẻm, khách đi chợ tạp hóa Cô Ba',
                desc: 'Nằm tách biệt bên khoảng sân cây xanh rộng rãi, dễ thu hút người đi đường.',
                x: 1380, y: 250, w: 240, h: 175, doorX: 1500, doorY: 445
            }
        ],
        BETTER_STREET: [
            {
                id: 'rent_better_1',
                name: 'Mặt Bằng Phố Thịnh Vượng',
                price: 8500000,
                area: '30m²',
                traffic: '★★★☆☆',
                customerType: 'Các hộ gia đình khá giả, khách mua bánh ngọt & đọc sách',
                desc: 'Biệt thự phố có sân vườn thoáng đãng, nằm giữa tiệm bánh Pháp và hiệu sách.',
                x: 600, y: 240, w: 230, h: 180, doorX: 715, doorY: 440
            },
            {
                id: 'rent_better_2',
                name: 'Mặt Bằng Góc Phố Mới',
                price: 11000000,
                area: '38m²',
                traffic: '★★★★☆',
                customerType: 'Cư dân thu nhập khá, sẵn sàng chi trả giá đồ uống cao hơn',
                desc: 'Nhà phố 2 tầng sơn mới có khoảng sân lát gạch rộng để bày bàn ghế sân vườn.',
                x: 1260, y: 820, w: 250, h: 180, doorX: 1385, doorY: 805
            }
        ],
        DOWNTOWN: [
            {
                id: 'rent_downtown_1',
                name: 'Kiot Đại Lộ Mua Sắm',
                price: 22000000,
                area: '42m²',
                traffic: '★★★★★',
                customerType: 'Tín đồ mua sắm thời trang, giới trẻ sành điệu, khách vãng lai',
                desc: 'Nằm cạnh Boutique Thời Trang và Quảng trường Đài phun nước Trung Tâm.',
                x: 560, y: 230, w: 220, h: 180, doorX: 670, doorY: 430
            },
            {
                id: 'rent_downtown_2',
                name: 'Mặt Bằng Vàng Trung Tâm',
                price: 30000000,
                area: '60m²',
                traffic: '★★★★★',
                customerType: 'Khách thượng lưu đi mua xe sang, trang sức & thời trang cao cấp',
                desc: 'Vị trí kim cương đắt giá bậc nhất khu đại lộ mua sắm trung tâm Sài Gòn.',
                x: 1300, y: 830, w: 270, h: 185, doorX: 1435, doorY: 815
            }
        ],
        OFFICE_DISTRICT: [
            {
                id: 'rent_office_1',
                name: 'Mặt Bằng Sảnh Cao Ốc',
                price: 17500000,
                area: '35m²',
                traffic: '★★★★☆',
                customerType: 'Dân văn phòng, nhân viên ngân hàng cần cà phê tỉnh táo mỗi sáng',
                desc: 'Có khoảng sân lót đá hoa cương thoáng rộng ngay cạnh Cao ốc Saigon Tower.',
                x: 580, y: 230, w: 220, h: 180, doorX: 690, doorY: 430
            },
            {
                id: 'rent_office_2',
                name: 'Mặt Bằng Phố Tài Chính',
                price: 24000000,
                area: '50m²',
                traffic: '★★★★★',
                customerType: 'Giám đốc, chuyên viên tài chính, khách họp hành & gặp đối tác',
                desc: 'Mặt tiền kính sang trọng đối diện Ngân Hàng VietBank & Khu Bistro Công Sở.',
                x: 1320, y: 830, w: 260, h: 180, doorX: 1450, doorY: 815
            }
        ],
        DISTRICT_1: [
            {
                id: 'rent_d1_1',
                name: 'Mặt Bằng Phố Đi Bộ Q.1',
                price: 28000000,
                area: '48m²',
                traffic: '★★★★★',
                customerType: 'Du khách, giới trẻ ăn chơi về đêm, khách dạo quảng trường phố đi bộ',
                desc: 'Nằm ngay quảng trường phố đêm rộng lớn giữa dàn đèn Neon rực rỡ.',
                x: 560, y: 230, w: 220, h: 180, doorX: 670, doorY: 430
            },
            {
                id: 'rent_d1_2',
                name: 'Mặt Bằng Góc Vàng Phố Đêm',
                price: 35000000,
                area: '65m²',
                traffic: '★★★★★',
                customerType: 'Dân chơi sành điệu, khách VIP từ Lounge, Club & Nhà hàng BBQ',
                desc: 'Mặt bằng đắt đỏ nhất thành phố! Có sân thượng & khoảng sân rộng cho khách chill.',
                x: 1320, y: 830, w: 270, h: 185, doorX: 1455, doorY: 815
            }
        ],
        ELDERLY_AREA: [
            {
                id: 'rent_elderly_1',
                name: 'Mặt Bằng Phố Cổ Hoa Giấy',
                price: 16000000,
                area: '36m²',
                traffic: '★★★☆☆',
                customerType: 'Các bác hưu trí khá giả, người yêu thích trà đạo, cờ tướng & đồ cổ',
                desc: 'Nằm giữa khu vườn cổ kính yên tĩnh, giàn hoa giấy rủ bóng mát rượi.',
                x: 560, y: 230, w: 230, h: 180, doorX: 675, doorY: 430
            },
            {
                id: 'rent_elderly_2',
                name: 'Biệt Thự Cổ Mặt Tiền',
                price: 21000000,
                area: '55m²',
                traffic: '★★★★☆',
                customerType: 'Giới sưu tầm nghệ thuật, cư dân biệt thự cổ thưởng thức cà phê phin',
                desc: 'Biệt thự Pháp cổ kính có sân vườn riêng biệt, giá trị bất động sản rất cao.',
                x: 1320, y: 830, w: 260, h: 185, doorX: 1450, doorY: 815
            }
        ],
        BREEZE_AREA: [
            {
                id: 'rent_breeze_1',
                name: 'Kiot Cà Phê Đón Gió',
                price: 14000000,
                area: '34m²',
                traffic: '★★★★☆',
                customerType: 'Người đạp xe thể thao sáng sớm, giới trẻ ra bờ kè hóng gió biển',
                desc: 'Không gian mở đón trọn làn gió biển mát rượi, sát cạnh đường đạp xe ven biển.',
                x: 560, y: 220, w: 225, h: 170, doorX: 672, doorY: 410

            }
        ]
    },

    // Danh sách 35 NPC có tên tại 10 khu phố
    NPCS: [
        // 1. Bé Út (Minh Thư) & Anh Hưng
        {
            id: 'be_ut',
            name: 'Bé Út (Minh Thư)',
            role: 'Phụ bán Tiệm Tạp Hóa Cô Ba',
            romancePartnerId: 'anh_hung',
            zone: 'HOME_STREET',
            x: 910, y: 1035,
            minX: 840, maxX: 990,
            speed: 0.38, dir: 1,
            genderIndex: 1,
            shirt: '#e5a93c', shadow: '#b88225', shorts: '#3d352e',
            accessory: 'none',
            dialogues: [
                'Sáng sớm 5 giờ trời mát quá ha! Nay ghé lấy hạt cà phê sớm để Cô Ba tính giá sỉ cho nè.',
                'Hồi nhỏ em mê mùi cà phê phin đầu hẻm lắm, lớn lên chỉ mong có ai mở quán ngay gần nhà.'
            ],
            dialoguesForFemalePlayer: [
                "Anh Hưng ngày nào cũng ghé giao đá cho tiệm. Bữa nào rảnh em định rủ ảnh đi ăn sáng.",
                "Chị cũng hay trò chuyện với ảnh hả? Vậy chắc em phải tự mở lời trước rồi."
            ]
        },
        {
            id: 'anh_hung',
            name: 'Anh Hưng',
            role: 'Mối giao đá & cà phê sỉ',
            romancePartnerId: 'be_ut',
            zone: 'HOME_STREET',
            x: 1055, y: 1020,
            minX: 1015, maxX: 1150,
            speed: 0.35, dir: -1,
            genderIndex: 0,
            shirt: '#3b78b8', shadow: '#285585', shorts: '#2e3830',
            accessory: 'cap',
            dialogues: [
                'Chào chú em, sáng nào tôi cũng ghé phụ Út khiêng mấy bao đá cho đỡ cực. Thanh niên khởi nghiệp cố lên nhé!',
                'Ở hẻm này ai mà chẳng quý Bé Út, lo làm ăn cho tốt kẻo tụt lại phía sau đấy.'
            ],
            dialoguesForFemalePlayer: [
                "Chào bạn! Tôi vừa giao đá xong, đang kiếm chỗ ngồi uống cà phê cho tỉnh.",
                "Bữa nào bạn rảnh, mình ngồi uống một ly rồi kể tôi nghe chuyện mở quán nhé."
            ]
        },

        // 2. Phương Vy & Đức Anh
        {
            id: 'phuong_vy',
            name: 'Phương Vy',
            role: "Chủ Tiệm Bánh Pháp L'Amour",
            romancePartnerId: 'duc_anh',
            zone: 'BETTER_STREET',
            x: 375, y: 460,
            minX: 300, maxX: 460,
            speed: 0.32, dir: 1,
            genderIndex: 1,
            shirt: '#f2eadc', shadow: '#cbb89f', shorts: '#8c5d47',
            accessory: 'hat',
            dialogues: [
                'Bánh Croissant vừa ra lò còn ấm nóng luôn nè. Giá mà có thêm một ly cà phê đen ít đường nhâm nhi thì tuyệt!',
                'Mình thích những người làm việc chăm chỉ và có chút mơ mộng giống mùi bơ nướng buổi sớm.'
            ],
            dialoguesForFemalePlayer: [
                "Mình để dành một mẻ bánh mới cho Đức Anh. Hôm trước anh ấy mang sách sang cho mình mượn.",
                "Mình tính rủ anh ấy đi hội sách cuối tuần. Bạn cũng quen Đức Anh à?"
            ]
        },
        {
            id: 'duc_anh',
            name: 'Đức Anh',
            role: 'Con trai chủ Hiệu Sách Nhà Nam',
            romancePartnerId: 'phuong_vy',
            zone: 'BETTER_STREET',
            x: 1455, y: 460,
            minX: 1380, maxX: 1540,
            speed: 0.3, dir: -1,
            genderIndex: 0,
            shirt: '#5f7a61', shadow: '#3d5240', shorts: '#2c3e50',
            accessory: 'none',
            dialogues: [
                'Chào bạn, tôi đang chọn vài cuốn tiểu thuyết Pháp mới về để lát mang sang tiệm bánh tặng Vy.',
                'Vy thích đọc sách và nghe nhạc nhẹ lắm, không biết gu của bạn có hợp với cô ấy không?'
            ],
            dialoguesForFemalePlayer: [
                "Tôi vừa xếp xong kệ sách mới. Nếu bạn thích đọc truyện Pháp, tôi có vài cuốn muốn giới thiệu.",
                "Bữa nào quán vắng, mình đổi sách rồi ngồi uống cà phê nhé?"
            ]
        },

        // 3. Bảo Ngọc & Trưởng phòng Hoàng
        {
            id: 'bao_ngoc',
            name: 'Bảo Ngọc',
            role: 'Chuyên viên Tài chính Saigon Tower',
            romancePartnerId: 'sep_hoang',
            zone: 'OFFICE_DISTRICT',
            x: 335, y: 460,
            minX: 250, maxX: 440,
            speed: 0.42, dir: 1,
            genderIndex: 1,
            shirt: '#2c3e50', shadow: '#1a252f', shorts: '#1c1c1c',
            accessory: 'none',
            dialogues: [
                'Mới sáng mà KPI đã dí tới nơi rồi... Cho mình hỏi gần đây có chỗ nào pha cà phê thật đậm để tỉnh táo không?',
                'Đừng nhìn vẻ ngoài lạnh lùng của tôi mà ngại, thật ra tôi rất trân trọng ai chịu lắng nghe mình than thở.'
            ],
            dialoguesForFemalePlayer: [
                "Ngoài giờ làm, anh Hoàng nói chuyện vui hơn ở phòng họp nhiều. Tôi định rủ anh ấy đi ăn tối.",
                "Bạn cũng hay gặp anh Hoàng dưới sảnh à? Bữa khác tôi sẽ chủ động hẹn anh ấy."
            ]
        },
        {
            id: 'sep_hoang',
            name: 'Trưởng phòng Hoàng',
            role: 'Quản lý cấp cao Phố Tài Chính',
            romancePartnerId: 'bao_ngoc',
            zone: 'OFFICE_DISTRICT',
            x: 1350, y: 460,
            minX: 1260, maxX: 1460,
            speed: 0.36, dir: -1,
            genderIndex: 0,
            shirt: '#7d3c98', shadow: '#5b2c6f', shorts: '#1f2229',
            accessory: 'none',
            dialogues: [
                'Cậu bán cà phê dạo à? Tối nay tôi có đặt bàn Bistro mời Bảo Ngọc dùng bữa bàn chuyện dự án mới.',
                'Phụ nữ làm tài chính như Ngọc cần một chỗ dựa vững chắc, cậu cố gắng mở được mặt bằng lớn đi rồi hãy nói chuyện.'
            ],
            dialoguesForFemalePlayer: [
                "Sáng nay tôi vừa ra khỏi phòng họp được năm phút. May mà có mùi cà phê ngoài sảnh.",
                "Nếu có dịp, tôi muốn nghe bạn kể vì sao chọn mở quán. Hẹn nhau một ly nhé?"
            ]
        },

        // 4. Thảo Nhi & Lâm
        {
            id: 'thao_nhi',
            name: 'Thảo Nhi',
            role: 'Họa sĩ ký họa Công Viên',
            romancePartnerId: 'nhiep_anh_lam',
            zone: 'PARK',
            x: 785, y: 920,
            minX: 755, maxX: 900,
            speed: 0.34, dir: 1,
            genderIndex: 1,
            shirt: '#d97248', shadow: '#a84f2c', shorts: '#4a3525',
            accessory: 'hat',
            dialogues: [
                'Hồ sen sáng nay nắng đẹp quá, mình đang vẽ dở bức tranh màu nước mà quên mất cả ăn sáng luôn rồi!',
                'Nếu có ly Trà Cam Sả mát lạnh ngồi dưới tán cây này vẽ tranh thì chắc mình có cảm hứng cả ngày mất.'
            ],
            dialoguesForFemalePlayer: [
                "Lâm chỉ mình một góc hồ lên màu rất đẹp. Hôm nào mình muốn hẹn anh ấy đi vẽ chung.",
                "Nếu bạn cũng rủ Lâm đi dạo, chắc mình phải hỏi anh ấy trước khi trời đổi mưa mất."
            ]
        },
        {
            id: 'nhiep_anh_lam',
            name: 'Lâm',
            role: 'Nhiếp ảnh gia tự do',
            romancePartnerId: 'thao_nhi',
            zone: 'PARK',
            x: 1120, y: 480,
            minX: 1000, maxX: 1260,
            speed: 0.4, dir: -1,
            genderIndex: 0,
            shirt: '#4f8a46', shadow: '#2e592c', shorts: '#3d352e',
            accessory: 'cap',
            dialogues: [
                'Tôi vừa săn được vài góc ảnh bình minh cực chill ở Công Viên, lát nữa rủ Thảo Nhi đi xem cùng cho vui.',
                'Người làm nghệ thuật như tụi tôi hợp nhau ở cái tự do, bạn cũng thích lang thang công viên à?'
            ],
            dialoguesForFemalePlayer: [
                "Tôi hay chụp ảnh hồ lúc sáng sớm. Có vài góc đẹp ngay gần đường bạn đẩy xe qua.",
                "Nếu thích, lần tới mình đi một vòng hồ. Tôi mang máy ảnh, còn bạn chọn cà phê nhé."
            ]
        },

        // 5. Kỳ Duyên & DJ Ken (Khánh)
        {
            id: 'ky_duyen',
            name: 'Kỳ Duyên',
            role: 'Ca sĩ Acoustic Phố Đêm Q.1',
            romancePartnerId: 'dj_ken',
            zone: 'DISTRICT_1',
            x: 310, y: 460,
            minX: 220, maxX: 420,
            speed: 0.36, dir: 1,
            genderIndex: 1,
            shirt: '#c0392b', shadow: '#922b21', shorts: '#191324',
            accessory: 'none',
            dialogues: [
                'Đêm nào cũng hát dưới ánh đèn Neon đến khuya... Đôi khi mình chỉ thèm một ly cà phê yên tĩnh và người chịu nghe mình nói.',
                'Quận 1 ồn ào vậy thôi chứ lòng người dễ cô đơn lắm. Khi nào rảnh ghé nghe mình hát nhé!'
            ],
            dialoguesForFemalePlayer: [
                "Ken hay ở lại nghe mình tập hát sau giờ đóng cửa. Mình định mời anh ấy đi ăn sau buổi diễn.",
                "Bạn cũng muốn gặp Ken à? Chắc tối nay mình sẽ hỏi anh ấy trước khi lên sân khấu."
            ]
        },
        {
            id: 'dj_ken',
            name: 'DJ Ken (Khánh)',
            role: 'DJ nổi tiếng Skyline Club',
            romancePartnerId: 'ky_duyen',
            zone: 'DISTRICT_1',
            x: 1080, y: 485,
            minX: 980, maxX: 1220,
            speed: 0.44, dir: -1,
            genderIndex: 0,
            shirt: '#8e44ad', shadow: '#6c3483', shorts: '#16191f',
            accessory: 'cap',
            dialogues: [
                'Yo! Tối nay set nhạc của anh ở Skyline cháy lắm, Duyên cũng hát ngay sau slot của anh đấy.',
                'Đất Quận 1 này đắt đỏ lắm bro, mở được quán ở đây đi rồi hẳn tính chuyện làm quen với ca sĩ!'
            ],
            dialoguesForFemalePlayer: [
                "Chào bạn! Tôi đang chọn nhạc cho tối nay. Ban ngày thì tôi thích nghe đĩa cũ và uống cà phê.",
                "Nếu bạn ghé sau buổi diễn, tôi để dành một bản nhạc cho bạn nghe nhé."
            ]
        },

        {
            id: "chu_tu", name: "Chú Tư Thành",
            role: "Trưởng khu phố", kind: 'resident',
            zone: 'HOME_STREET', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#526d56', shadow: '#3b4e3d', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Chú là trưởng khu phố. Có chuyện gì cần hỏi về hẻm thì cứ ghé.",
                "Đậu xe cà phê nhớ chừa lối cho bà con đi chợ nghen."
            ]
        },
        {
            id: "my_linh", name: "Mỹ Linh",
            role: "Bạn thân từ nhỏ của chủ quán", kind: 'resident',
            zone: 'HOME_STREET', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#d47a65', shadow: '#985748', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Hồi nhỏ hai đứa lấy ghế nhựa bày quán giả ngay đầu hẻm. Giờ mày làm thiệt rồi ha!",
                "Khi nào có món mới, chừa tao một ly để góp ý nha."
            ]
        },
        {
            id: "anh_phuc", name: "Anh Phúc",
            role: "Thợ sửa xe đầu hẻm", kind: 'resident',
            zone: 'HOME_STREET', x: 1220, y: 716, minX: 1180, maxX: 1260,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#52787c', shadow: '#3b5659', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Xe đẩy mà nghe kêu cọc cọc thì ghé anh coi bánh cho.",
                "Cho anh ly đen đá ít đường, uống xong còn vá xe cho khách."
            ]
        },
        {
            id: "co_mai", name: "Cô Mai",
            role: "Chủ tiệm hoa", kind: 'resident',
            zone: 'BETTER_STREET', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 1,
            shirt: '#9d6093', shadow: '#714569', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Sáng cô ra lấy hoa, mùi cà phê rang bay qua thơm cả tiệm.",
                "Có mở quán, cô tặng con một nhánh hoa giấy trồng trước cửa."
            ]
        },
        {
            id: "bao_nam", name: "Bảo Nam",
            role: "Kiến trúc sư nội thất", kind: 'resident',
            zone: 'BETTER_STREET', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 0,
            shirt: '#52798f', shadow: '#3b5766', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Tôi hay ngồi vẽ ở ngoài hiên. Quán có bóng cây là tôi ghé liền.",
                "Mặt bằng nhỏ mà lối đi thoáng thì khách ngồi vẫn dễ chịu."
            ]
        },
        {
            id: "ong_khai", name: "Ông Khải",
            role: "Đại gia, chủ showroom xe", kind: 'resident',
            zone: 'DOWNTOWN', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#5a536e', shadow: '#403b4f', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Tôi bắt đầu bằng một tiệm sửa xe có đúng hai cái ghế nhựa.",
                "Hôm nào có cà phê phin, cho tôi một ly đen. Tôi thích đợi từng giọt."
            ]
        },
        {
            id: "ha_vy", name: "Hạ Vy",
            role: "Chủ boutique thời trang", kind: 'resident',
            zone: 'DOWNTOWN', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#b6637e', shadow: '#83475a', shorts: '#34333c', accessory: 'hat',
            dialogues: [
                "Mở cửa tiệm xong là chị thèm một ly bạc xỉu.",
                "Giờ tan tầm khách đông lắm, em thử ghé bán lúc đó xem."
            ]
        },
        {
            id: "minh_khoa", name: "Minh Khoa",
            role: "Bạn đại học của chủ quán", kind: 'resident',
            zone: 'DOWNTOWN', x: 1220, y: 716, minX: 1180, maxX: 1260,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#477b83', shadow: '#33585e', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Ê, nhận ra tao không? Hồi đại học tụi mình thức khuya làm đồ án bằng cà phê gói đó.",
                "Tao làm chụp ảnh quanh đây. Bữa nào tao ghé chụp cái xe cà phê cho mày."
            ]
        },
        {
            id: "lan_chi", name: "Lan Chi",
            role: "Nhân viên cửa hàng trang sức", kind: 'resident',
            zone: 'DOWNTOWN', x: 1730, y: 716, minX: 1690, maxX: 1770,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#7c67aa', shadow: '#594a7a', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Chị tranh thủ ra đây hóng gió trước ca chiều.",
                "Quán có trà mát thì chị rủ cả mấy bạn cùng ca qua."
            ]
        },
        {
            id: "quoc_huy", name: "Quốc Huy",
            role: "Nhân viên giao hàng", kind: 'resident',
            zone: 'DOWNTOWN', x: 1750, y: 456, minX: 1710, maxX: 1790,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#ba6d3f', shadow: '#854e2d', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Em chạy tuyến này mỗi sáng. Thấy xe cà phê của anh là biết tới giờ nghỉ.",
                "Có ly nào dễ mang đi thì để em đặt một ly cho chuyến sau."
            ]
        },
        {
            id: "thu_trang", name: "Thu Trang",
            role: "Đồng nghiệp cũ, nhân viên kế toán", kind: 'resident',
            zone: 'OFFICE_DISTRICT', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 1,
            shirt: '#7566a4', shadow: '#544976', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Cả phòng vẫn nhớ hồi cậu hay pha phin lúc chốt sổ cuối tháng.",
                "Mai tớ rủ mấy bạn trong phòng xuống mua ủng hộ nhé."
            ]
        },
        {
            id: "duc_tin", name: "Đức Tín",
            role: "Đồng nghiệp cũ, nhân viên IT", kind: 'resident',
            zone: 'OFFICE_DISTRICT', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 0,
            shirt: '#417d67', shadow: '#2e5a4a', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Từ ngày cậu nghỉ, cái bình cà phê trong phòng nằm im luôn.",
                "Tớ hay xuống sảnh sau giờ họp sáng. Gặp xe cậu thì cho tớ một ly."
            ]
        },
        {
            id: "anh_thao", name: "Anh Thảo",
            role: "Lễ tân Saigon Tower", kind: 'resident',
            zone: 'OFFICE_DISTRICT', x: 1220, y: 716, minX: 1180, maxX: 1260,
            speed: 0.35, dir: 1, genderIndex: 1,
            shirt: '#b95966', shadow: '#854049', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Em trực sảnh từ sớm, có khi còn tới trước cả bảo vệ.",
                "Buổi sáng khách hay hỏi em quanh đây có chỗ mua cà phê mang đi không."
            ]
        },
        {
            id: "bac_nam", name: "Bác Năm",
            role: "Người chăm vườn công viên", kind: 'resident',
            zone: 'PARK', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#557b48', shadow: '#3d5833', shorts: '#34333c', accessory: 'hat',
            dialogues: [
                "Bác tưới cây sớm để tới lúc bà con đi bộ thì lối đi đã ráo.",
                "Nếu ghé hồ ngồi uống cà phê, coi chừng mấy con chim sẻ giành bánh mì đó."
            ]
        },
        {
            id: "yen_nhi", name: "Yến Nhi",
            role: "Sinh viên mỹ thuật", kind: 'resident',
            zone: 'PARK', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#478d91', shadow: '#336568', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Em đang ký họa mấy xe hàng rong quanh thành phố. Xe cà phê của anh lên tranh chắc đẹp.",
                "Hôm trời mưa em ngồi dưới mái hiên vẽ hồ, yên tĩnh lắm."
            ]
        },
        {
            id: "mai_anh", name: "Mai Anh",
            role: "Quản lý nhà hàng đêm", kind: 'resident',
            zone: 'DISTRICT_1', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 1,
            shirt: '#865e93', shadow: '#604369', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Bên chị chuẩn bị bàn từ chiều, tới tối mới bắt đầu đông.",
                "Mấy đứa trong bếp thích cà phê đen trước giờ vào ca."
            ]
        },
        {
            id: "tuan_vu", name: "Tuấn Vũ",
            role: "Kỹ thuật viên âm thanh", kind: 'resident',
            zone: 'DISTRICT_1', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 0,
            shirt: '#516c88', shadow: '#3a4d61', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Anh kéo dây loa từ chiều. Đến khi thử nhạc xong mới có thời gian uống một ly.",
                "Muốn nghe hát rõ thì đứng gần bàn âm thanh, ngay chỗ anh làm đó."
            ]
        },
        {
            id: "ong_bay", name: "Ông Bảy",
            role: "Thợ sửa đồng hồ về hưu", kind: 'resident',
            zone: 'ELDERLY_AREA', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#886b4f', shadow: '#614d38', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Hồi còn sửa đồng hồ, sáng nào ông cũng pha đúng một phin.",
                "Con ngồi chút đi. Phin nhỏ mà vội rót nước là cà phê nhạt ngay."
            ]
        },
        {
            id: "ba_sau", name: "Bà Sáu",
            role: "Chủ quán chè lâu năm", kind: 'resident',
            zone: 'ELDERLY_AREA', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#976275', shadow: '#6c4654', shorts: '#34333c', accessory: 'hat',
            dialogues: [
                "Bà bán chè ở phố này từ hồi đường còn chưa trải nhựa.",
                "Có hôm chè ế, bà đem chia hàng xóm. Hôm sau họ lại mang trái cây qua cho bà."
            ]
        },
        {
            id: "bac_son", name: "Bác Sơn",
            role: "Giáo viên về hưu", kind: 'resident',
            zone: 'ELDERLY_AREA', x: 1220, y: 716, minX: 1180, maxX: 1260,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#5b766d', shadow: '#41544e', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Bác ra đây đi bộ rồi mới về đọc báo. Gặp ai quen thì dừng lại nói đôi câu.",
                "Mở quán nhớ kê cái ghế có tựa. Mấy người đau lưng như bác quý lắm."
            ]
        },
        {
            id: "co_huong", name: "Cô Hương",
            role: "Chủ tiệm đồ cổ", kind: 'resident',
            zone: 'ELDERLY_AREA', x: 1730, y: 716, minX: 1690, maxX: 1770,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#a27555', shadow: '#74543d', shorts: '#34333c', accessory: 'none',
            dialogues: [
                "Trong tiệm cô còn một bộ phin nhôm cũ, tay cầm đã mòn bóng.",
                "Rảnh thì ghé nghe cô kể nó từng nằm ở một quán đầu ga như thế nào."
            ]
        },
        {
            id: "nhat_long", name: "Nhật Long",
            role: "Thợ sửa xe đạp ven biển", kind: 'resident',
            zone: 'BREEZE_AREA', x: 345, y: 716, minX: 305, maxX: 385,
            speed: 0.35, dir: 1, genderIndex: 0,
            shirt: '#3d8585', shadow: '#2b5f5f', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Sáng sớm có cả đoàn đạp xe qua đây. Họ hay dừng nghỉ ở bờ kè.",
                "Gió biển làm xích mau rỉ. Cuối ngày tôi còn phải lau cả dãy xe thuê."
            ]
        },
        {
            id: "thao_vy", name: "Thảo Vy",
            role: "Bạn cũ, hướng dẫn viên đi bộ", kind: 'resident',
            zone: 'BREEZE_AREA', x: 690, y: 716, minX: 650, maxX: 730,
            speed: 0.35, dir: -1, genderIndex: 1,
            shirt: '#5683a0', shadow: '#3d5e73', shorts: '#34333c', accessory: 'hat',
            dialogues: [
                "Nhớ hồi tụi mình đạp xe ra đây đón bình minh không? Giờ tao dẫn khách đi đúng tuyến đó.",
                "Tụi tao hay nghỉ ở bờ kè. Mày đem xe cà phê qua là có người mua đấy."
            ]
        },
        {
            id: "chi_man", name: "Chị Mận",
            role: "Người bán hải sản buổi sớm", kind: 'resident',
            zone: 'BREEZE_AREA', x: 1220, y: 716, minX: 1180, maxX: 1260,
            speed: 0.35, dir: 1, genderIndex: 1,
            shirt: '#a25848', shadow: '#743f33', shorts: '#34333c', accessory: 'hat',
            dialogues: [
                "Chị dọn hàng từ lúc trời còn tối, tới khi có nắng mới được ngồi xuống.",
                "Chị thích bạc xỉu nhiều đá. Đứng ngoài gió mà vẫn nóng ghê."
            ]
        },
        {
            id: "gia_bao", name: "Gia Bảo",
            role: "Nhiếp ảnh gia ven biển", kind: 'resident',
            zone: 'BREEZE_AREA', x: 1730, y: 716, minX: 1690, maxX: 1770,
            speed: 0.35, dir: -1, genderIndex: 0,
            shirt: '#667d54', shadow: '#495a3c', shorts: '#34333c', accessory: 'cap',
            dialogues: [
                "Tôi đang chờ nắng lên để chụp mấy chiếc thuyền ngoài xa.",
                "Lúc gió lớn tôi hay tìm chỗ có mái che ngồi xem lại ảnh."
            ]
        }
    ],

    // Bảng màu Warm Vintage Pixel Art trích xuất trực tiếp từ ảnh tham khảo TP.HCM
    PALETTE: {
        OUTLINE: '#2b1d16',         // Viền nâu đen đặc trưng của nét vẽ Pixel Art
        OUTLINE_SOFT: '#4a3525',    // Viền phụ ấm
        WALL_OCHRE: '#e3b478',      // Tường vàng cam nắng sớm
        WALL_OCHRE_DARK: '#c99355', // Tường vàng cam đổ bóng
        WALL_GOLD: '#d99b4e',       // Tường nhà phố vàng đậm
        WALL_CREAM: '#ecd3ab',      // Tường kem sáng
        WALL_MINT: '#b8c4a8',       // Tường xanh rêu nhạt cổ điển
        WALL_FG_GREY: '#8c8c7a',    // Tường nhà tiền cảnh góc phải
        ROOF_TILE_DARK: '#6e4736',  // Mái ngói nâu sẫm
        ROOF_TILE_LIGHT: '#8c5d47', // Mái ngói nâu sáng
        SHUTTER_GREEN: '#5f7a61',   // Cửa sắt kéo xanh rêu
        SHUTTER_DARK: '#3d5240',    // Khe cửa sắt kéo
        AWNING_GREEN: '#7a9674',    // Mái hiên kẻ sọc xanh
        AWNING_CREAM: '#dfd1b4',    // Mái hiên kẻ sọc kem
        SIGN_RED: '#c84b31',        // Biển hiệu đỏ "CHO THUÊ MẶT BẰNG"
        SIGN_YELLOW: '#f0b643',     // Viền vàng biển hiệu
        SIDEWALK_LIGHT: '#b5a496',  // Gạch vỉa hè sáng
        SIDEWALK_MID: '#9e8d7f',    // Gạch vỉa hè trung gian
        SIDEWALK_DARK: '#827265',   // Gạch vỉa hè tối
        ROAD_ASPHALT: '#69605c',    // Mặt đường nhựa nâu xám ấm
        ROAD_DARK: '#574e4b',       // Vệt bóng mặt đường
        ROAD_LINE: '#c9a654',       // Vạch kẻ đường vàng trầm
        PLANT_GREEN: '#4f8a46',     // Lá cây xanh
        PLANT_HIGHLIGHT: '#7bb357', // Lá cây bắt nắng
        PLANT_SHADOW: '#2e592c',    // Lá cây trong bóng râm
        POT_TERRACOTTA: '#b85d38',  // Chậu đất nung
        CART_STEEL: '#b0b5b8',      // Xe đẩy cà phê inox
        CART_DARK: '#7d8487'        // Bóng inox
    }
};
