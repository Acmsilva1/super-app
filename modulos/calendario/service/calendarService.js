import { Event } from '../model/event.js';

class CalendarService {
    getBrazilTime() {
        return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    }

    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    generateCalendarGrid(month) {
        const year = 2026;
        const days = this.getDaysInMonth(year, month);
        const grid = [];
        
        for (let i = 1; i <= days; i++) {
            grid.push({
                day: i,
                fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
            });
        }
        return grid;
    }
}

const calendarService = new CalendarService();
export { calendarService };
