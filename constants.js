// constants.js - Cấu hình cốt lõi & Bảng màu Pixel Art Sài Gòn Hoài Cổ (5AM)
const GAME_CONFIG = {
    TITLE: "5AM",
    SUBTITLE: "Khởi Nghiệp Cà Phê Hẻm Sài Gòn",
    CANVAS_WIDTH: 1000,
    CANVAS_HEIGHT: 650,
    PIXEL_SIZE: 2, // Độ mịn điểm ảnh chuẩn theo ảnh tham khảo

    // Hệ thống thời gian & cơ chế ngày/đêm
    TIME: {
        WAKE_UP_HOUR: 5.0,       // Giờ thức dậy mặc định (5:00 sáng)
        MARKET_CLOSE_HOUR: 18.5, // Chợ đóng cửa lúc 18:30
        SLEEP_PENALTY_LIMIT: 24, // Ngủ sau 12h đêm sẽ bị phạt dậy muộn
        LATE_WAKE_UP_HOUR: 8.0   // Giờ thức dậy muộn nếu hôm trước ngủ quá khuya
    },

    // Trạng thái màn hình game (Game States)
    STATES: {
        MENU: 'MENU',
        CHARACTER_CREATION: 'CHARACTER_CREATION',
        INTRO: 'INTRO',
        PLAYING_HOME: 'PLAYING_HOME',
        PLAYING_STREET: 'PLAYING_STREET'
    },

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
