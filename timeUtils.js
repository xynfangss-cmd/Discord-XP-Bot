class TimeUtils {
    static parseTimeString(timeString) {
        // Parse various time formats like "5pm", "17:30", "tomorrow 8pm", etc.
        const now = new Date();
        const lowerTime = timeString.toLowerCase().trim();
        
        // Handle "tomorrow"
        if (lowerTime.startsWith('tomorrow')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const timePart = lowerTime.replace('tomorrow', '').trim();
            return this.parseTimeOfDay(timePart, tomorrow);
        }
        
        // Handle "today"
        if (lowerTime.startsWith('today')) {
            const timePart = lowerTime.replace('today', '').trim();
            return this.parseTimeOfDay(timePart, now);
        }
        
        // Handle specific time formats
        return this.parseTimeOfDay(lowerTime, now);
    }
    
    static parseTimeOfDay(timeString, baseDate) {
        // Handle HH:MM format (24-hour)
        const time24Match = timeString.match(/^(\d{1,2}):(\d{2})$/);
        if (time24Match) {
            const hours = parseInt(time24Match[1]);
            const minutes = parseInt(time24Match[2]);
            const result = new Date(baseDate);
            result.setHours(hours, minutes, 0, 0);
            
            // If the time is in the past, move to next day
            if (result <= new Date()) {
                result.setDate(result.getDate() + 1);
            }
            return result;
        }
        
        // Handle AM/PM format
        const time12Match = timeString.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
        if (time12Match) {
            let hours = parseInt(time12Match[1]);
            const minutes = time12Match[2] ? parseInt(time12Match[2]) : 0;
            const period = time12Match[3];
            
            if (period === 'pm' && hours !== 12) {
                hours += 12;
            } else if (period === 'am' && hours === 12) {
                hours = 0;
            }
            
            const result = new Date(baseDate);
            result.setHours(hours, minutes, 0, 0);
            
            // If the time is in the past, move to next day
            if (result <= new Date()) {
                result.setDate(result.getDate() + 1);
            }
            return result;
        }
        
        // Handle simple hour with am/pm
        const hourMatch = timeString.match(/^(\d{1,2})\s*(am|pm)$/);
        if (hourMatch) {
            let hours = parseInt(hourMatch[1]);
            const period = hourMatch[2];
            
            if (period === 'pm' && hours !== 12) {
                hours += 12;
            } else if (period === 'am' && hours === 12) {
                hours = 0;
            }
            
            const result = new Date(baseDate);
            result.setHours(hours, 0, 0, 0);
            
            // If the time is in the past, move to next day
            if (result <= new Date()) {
                result.setDate(result.getDate() + 1);
            }
            return result;
        }
        
        return null;
    }
    
    static formatTimeRemaining(endTime) {
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) {
            return 'Ended';
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        
        return parts.join(' ') || 'Less than 1m';
    }
    
    static isValidTime(timeString) {
        return this.parseTimeString(timeString) !== null;
    }
    
    static getTimeExamples() {
        return [
            '5pm', '5:30pm', '17:30', 
            'tomorrow 8pm', 'today 3pm',
            '12am', '12pm', '6:15am'
        ];
    }
}

module.exports = TimeUtils;
