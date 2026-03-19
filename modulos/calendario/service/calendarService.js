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
        
        const firstDay = new Date(year, month, 1).getDay();
        const emptyCells = firstDay;
        
        for (let i = 0; i < emptyCells; i++) {
            grid.push({ empty: true });
        }
        
        for (let i = 1; i <= days; i++) {
            const dateObj = new Date(year, month, i);
            const wDay = dateObj.getDay();
            const isWeekend = wDay === 0 || wDay === 6;
            grid.push({
                empty: false,
                day: i,
                isWeekend: isWeekend,
                fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
            });
        }
        return grid;
    }
}

const calendarService = new CalendarService();

export function payloadInsertEvent(title, date, startTime, endTime, category) {
  return {
    title: title || '',
    date: date,
    start_time: startTime || null,
    end_time: endTime || null,
    category: category || ''
  };
}

export function payloadUpdateEvent(title, date, startTime, endTime, category) {
  const p = {};
  if (title !== undefined) p.title = title;
  if (date !== undefined) p.date = date;
  if (startTime !== undefined) p.start_time = startTime;
  if (endTime !== undefined) p.end_time = endTime;
  if (category !== undefined) p.category = category;
  return p;
}

export { calendarService };
