import { menu } from "./scripts/menu.js";
import { initDatabase } from "./scripts/database.js";
import { DATABASE_ENABLED } from "./config.js";
import { ensureValidToken } from "./scripts/token_validator.js";

// Main startup function
(async () => {
    // Initialize database if enabled
    if (DATABASE_ENABLED) {
        try {
            initDatabase();
            console.log("✅ Database initialized - Duplicate detection enabled");
        } catch (e) {
            console.log("⚠️  Database initialization failed, continuing without tracking");
            console.log("   Error:", e.message);
        }
    }

    // Validate token and display status
    const tokenValid = await ensureValidToken();
    if (!tokenValid) {
        console.log("Exiting due to invalid token.");
        process.exit(1);
    }

    // Launch main menu
    menu();
})();

// Danh sách timeline album đẹp
// ColourfulSpace: https://www.facebook.com/media/set/?vanity=ColourfulSpace&set=a.945632905514659
// J2Team-Girl: https://www.facebook.com/media/set/?set=oa.245004546697321&type=3
// J2Team-Girl: https://www.facebook.com/media/set/?set=oa.628769808043090&type=3
// AnhGirlXinh: https://www.facebook.com/media/set/?vanity=anhgirlxinh.net&set=a.568433099885020
// NgamGaiDep: https://www.facebook.com/media/set/?vanity=ngamgaidep.plus&set=a.1885102325148609
