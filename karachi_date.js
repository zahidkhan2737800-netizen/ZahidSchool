/**
 * karachi_date.js — Centralized Timezone-Aware Date Utility for Asia/Karachi (PKT)
 */

(function (global) {
    const TIMEZONE = 'Asia/Karachi';

    /**
     * Returns current date parts in Asia/Karachi timezone
     */
    function karachiNow() {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            weekday: 'short'
        });

        const parts = formatter.formatToParts(now);
        const p = {};
        parts.forEach(item => {
            p[item.type] = item.value;
        });

        const year = parseInt(p.year, 10);
        const month = parseInt(p.month, 10) - 1; // 0-indexed
        const day = parseInt(p.day, 10);
        const hour = parseInt(p.hour, 10) % 24;
        const minute = parseInt(p.minute, 10);
        const second = parseInt(p.second, 10);

        // Day of week index (0 = Sun, 1 = Mon, ..., 6 = Sat)
        const daysMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const dayOfWeek = daysMap[p.weekday] !== undefined ? daysMap[p.weekday] : now.getDay();

        return { year, month, day, hour, minute, second, dayOfWeek };
    }

    /**
     * Returns today's date in YYYY-MM-DD format (Asia/Karachi)
     */
    function karachiToday() {
        const kn = karachiNow();
        const y = kn.year;
        const m = String(kn.month + 1).padStart(2, '0');
        const d = String(kn.day).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Returns current year in Asia/Karachi
     */
    function karachiYear() {
        return karachiNow().year;
    }

    /**
     * Returns current month (0-indexed) in Asia/Karachi
     */
    function karachiMonth() {
        return karachiNow().month;
    }

    /**
     * Returns current day of month in Asia/Karachi
     */
    function karachiDay() {
        return karachiNow().day;
    }

    /**
     * Returns current day of week (0-6) in Asia/Karachi
     */
    function karachiDayOfWeek() {
        return karachiNow().dayOfWeek;
    }

    /**
     * Returns current month key in YYYY-MM format in Asia/Karachi
     */
    function karachiMonthKey() {
        const kn = karachiNow();
        const y = kn.year;
        const m = String(kn.month + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    /**
     * Format a Date object or timestamp string into localized date string in Asia/Karachi
     */
    function karachiFormatDate(dateInput, options = {}) {
        if (!dateInput) dateInput = new Date();
        const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return '—';

        const defaultOpts = {
            timeZone: TIMEZONE,
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        };
        return d.toLocaleDateString('en-GB', { ...defaultOpts, ...options });
    }

    /**
     * Format a Date object or timestamp string into localized time string in Asia/Karachi
     */
    function karachiFormatTime(dateInput, options = {}) {
        if (!dateInput) dateInput = new Date();
        const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return '—';

        const defaultOpts = {
            timeZone: TIMEZONE,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return d.toLocaleTimeString('en-PK', { ...defaultOpts, ...options });
    }

    /**
     * Convert any Date object to YYYY-MM-DD in Asia/Karachi timezone
     */
    function toKarachiYmd(dateObj) {
        if (!dateObj) return karachiToday();
        const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
        if (isNaN(d.getTime())) return karachiToday();

        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(d);
        const p = {};
        parts.forEach(item => { p[item.type] = item.value; });
        return `${p.year}-${p.month}-${p.day}`;
    }

    // Export functions globally
    global.karachiNow = karachiNow;
    global.karachiToday = karachiToday;
    global.karachiYear = karachiYear;
    global.karachiMonth = karachiMonth;
    global.karachiDay = karachiDay;
    global.karachiDayOfWeek = karachiDayOfWeek;
    global.karachiMonthKey = karachiMonthKey;
    global.karachiFormatDate = karachiFormatDate;
    global.karachiFormatTime = karachiFormatTime;
    global.toKarachiYmd = toKarachiYmd;

})(typeof window !== 'undefined' ? window : this);
