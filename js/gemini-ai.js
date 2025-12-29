// Gemini AI Integration for Timetable Generator
// Provides AI-powered scheduling suggestions and conflict analysis
// Updated for Gemini API v1beta (2025)

// Default configuration
const GEMINI_DEFAULTS = {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash', // Latest stable model (also available: gemini-2.5-flash, gemini-1.5-pro)
    maxOutputTokens: 8192,
    temperature: 0.7
};

// Get API key from local config (no database dependency)
function getGeminiApiKey() {
    if (typeof APP_CONFIG === 'undefined' || !APP_CONFIG.gemini?.apiKey) {
        console.warn('Gemini API key not configured in js/config.js');
        return null;
    }

    const apiKey = APP_CONFIG.gemini.apiKey;

    // Check if it's still the placeholder value
    if (apiKey === 'YOUR_GEMINI_API_KEY_HERE' || apiKey.includes('YOUR_')) {
        console.warn('Please set your actual Gemini API key in js/config.js');
        return null;
    }

    return apiKey;
}

// Get model from config or use default
function getGeminiModel() {
    if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.gemini?.model) {
        return APP_CONFIG.gemini.model;
    }
    return GEMINI_DEFAULTS.model;
}

// Build the full API URL
function getGeminiApiUrl() {
    const baseUrl = APP_CONFIG?.gemini?.baseUrl || GEMINI_DEFAULTS.baseUrl;
    const model = getGeminiModel();
    return `${baseUrl}/${model}:generateContent`;
}

// Core function to call Gemini API (updated for 2025 API)
async function callGeminiAPI(prompt) {
    const apiKey = getGeminiApiKey();
    const apiUrl = getGeminiApiUrl();

    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please add it in js/config.js');
    }

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: APP_CONFIG?.gemini?.temperature || GEMINI_DEFAULTS.temperature,
            maxOutputTokens: APP_CONFIG?.gemini?.maxOutputTokens || GEMINI_DEFAULTS.maxOutputTokens
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Handle the response structure
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        // Check for blocked content
        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            throw new Error('Response blocked due to safety filters. Please try rephrasing your request.');
        }

        // Check for empty response
        if (data.candidates?.length === 0) {
            throw new Error('No response generated. Please try again.');
        }

        throw new Error('Invalid response structure from Gemini API');
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

// Get AI suggestions before timetable generation
async function getAISchedulingSuggestions(subjects, teachers, classes, rooms, slots) {
    // Prepare summary data for the prompt
    const subjectSummary = Object.entries(subjects).map(([id, s]) => ({
        code: s.code || id,
        name: s.name,
        type: s.type,
        sessionsPerWeek: s.lecturesPerWeek,
        teacher: teachers[s.teacherId]?.name || s.teacherId,
        class: classes[s.classId]?.name || s.classId
    }));

    const teacherSummary = Object.entries(teachers).map(([id, t]) => ({
        id,
        name: t.name,
        dept: t.dept
    }));

    const classSummary = Object.entries(classes).map(([id, c]) => ({
        id,
        name: c.name,
        dept: c.dept
    }));

    const roomSummary = Object.entries(rooms).map(([id, r]) => ({
        id,
        name: r.name,
        type: r.type,
        capacity: r.capacity
    }));

    const slotsPerDay = Object.values(slots).filter(s => s.type !== 'break').length / 5;

    const prompt = `You are an expert academic scheduler. Analyze this timetable data and provide scheduling recommendations.

DATA:
- Classes: ${classSummary.length} classes
- Teachers: ${teacherSummary.length} teachers
- Subjects: ${subjectSummary.length} subjects
- Rooms: ${roomSummary.length} rooms (${roomSummary.filter(r => r.type === 'lab').length} labs)
- Time Slots: ${slotsPerDay} periods per day, 5 days

SUBJECTS:
${JSON.stringify(subjectSummary, null, 2)}

TEACHERS:
${JSON.stringify(teacherSummary, null, 2)}

Please provide:
1. **Optimal Distribution Strategy** - How to best distribute subjects across the week
2. **Potential Conflicts to Watch** - Likely scheduling conflicts based on the data
3. **Workload Balancing Tips** - Suggestions for balancing teacher workloads
4. **Practical Session Recommendations** - Best times/days for lab sessions
5. **Room Utilization Advice** - How to optimize room usage

Format your response as clear bullet points under each heading. Be specific and actionable.`;

    try {
        const response = await callGeminiAPI(prompt);
        return {
            success: true,
            suggestions: response
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Analyze generated timetable for conflicts and improvements
async function getAIConflictAnalysis(timetableData, subjects, teachers, classes, slots) {
    // Build timetable summary
    const timetableSummary = [];

    for (const [classId, classSchedule] of Object.entries(timetableData)) {
        const className = classes[classId]?.name || classId;

        for (const [slotId, entry] of Object.entries(classSchedule)) {
            const slot = slots[slotId];
            if (!slot || slot.type === 'break') continue;

            timetableSummary.push({
                class: className,
                day: slot.day,
                period: slot.period,
                subject: entry.subjectName || subjects[entry.subjectId]?.name,
                teacher: entry.teacherName || teachers[entry.teacherId]?.name,
                room: entry.roomName
            });
        }
    }

    // Group by teacher to find workload patterns
    const teacherWorkload = {};
    timetableSummary.forEach(entry => {
        if (!teacherWorkload[entry.teacher]) {
            teacherWorkload[entry.teacher] = { total: 0, byDay: {} };
        }
        teacherWorkload[entry.teacher].total++;
        teacherWorkload[entry.teacher].byDay[entry.day] =
            (teacherWorkload[entry.teacher].byDay[entry.day] || 0) + 1;
    });

    const prompt = `You are an expert academic scheduler. Analyze this generated timetable for potential issues and improvements.

GENERATED TIMETABLE SUMMARY:
${JSON.stringify(timetableSummary.slice(0, 50), null, 2)}
${timetableSummary.length > 50 ? `... and ${timetableSummary.length - 50} more entries` : ''}

TEACHER WORKLOAD:
${JSON.stringify(teacherWorkload, null, 2)}

Please analyze and provide:
1. **Detected Issues** - Any conflicts, imbalances, or problems found
2. **Teacher Fatigue Risks** - Teachers with too many consecutive periods or unbalanced days
3. **Subject Distribution Issues** - Same subject appearing too many times in a day
4. **Room Utilization Issues** - Any problems with room assignments
5. **Specific Improvements** - Concrete suggestions to improve this timetable

Be specific about which classes, teachers, or subjects need attention. Format as clear bullet points.`;

    try {
        const response = await callGeminiAPI(prompt);
        return {
            success: true,
            analysis: response
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Get AI help for resolving a specific conflict
async function getAIConflictResolution(conflict, availableSlots, subjects, teachers) {
    const prompt = `You are an expert academic scheduler. Help resolve this scheduling conflict.

CONFLICT:
${JSON.stringify(conflict, null, 2)}

AVAILABLE ALTERNATIVE SLOTS:
${JSON.stringify(availableSlots.slice(0, 10), null, 2)}

Please suggest:
1. The best alternative slot for this subject
2. Why this slot is the best choice
3. Any considerations to keep in mind

Be specific and provide actionable advice.`;

    try {
        const response = await callGeminiAPI(prompt);
        return {
            success: true,
            resolution: response
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Format AI response for display
function formatAIResponse(text) {
    // Convert markdown-style formatting to HTML
    let formatted = text
        // Headers
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Bullet points
        .replace(/^\s*[-*]\s+/gm, '<li>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in paragraphs
    formatted = '<p>' + formatted + '</p>';

    // Fix list items
    formatted = formatted.replace(/<li>/g, '</li><li>');
    formatted = formatted.replace(/<\/li><li>/, '<ul><li>');
    formatted = formatted.replace(/<\/li>(?!<li>)/g, '</li></ul>');

    return formatted;
}

// Check if Gemini API is configured
function isGeminiConfigured() {
    const apiKey = getGeminiApiKey();
    return !!apiKey;
}

// Get current model info (for display)
function getModelInfo() {
    return {
        model: getGeminiModel(),
        configured: isGeminiConfigured()
    };
}

// Export functions for use in other files
window.GeminiAI = {
    getSchedulingSuggestions: getAISchedulingSuggestions,
    getConflictAnalysis: getAIConflictAnalysis,
    getConflictResolution: getAIConflictResolution,
    isConfigured: isGeminiConfigured,
    formatResponse: formatAIResponse,
    getModelInfo: getModelInfo
};
