import { GoogleGenAI } from "@google/genai";

let ai: any = null;

try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI:", error);
}

export interface CoachFeedback {
  feedback: string;
  tips: string[];
}

export async function getCoachFeedback(
  performanceData: {
    completionRate: number;
    streak: number;
    screenTime?: number;
    missedDays: number;
  },
  isDarkMode: boolean
): Promise<CoachFeedback> {
  const tone = isDarkMode ? "calm and focused" : "energetic";
  const prompt = `
    You are an AI productivity coach. Analyze the following user performance and provide feedback.
    
    Data:
    - Task Completion Rate: ${performanceData.completionRate}%
    - Current Streak: ${performanceData.streak} days
    - Screen Time: ${performanceData.screenTime || "Not provided"} hours
    - Missed Days Count: ${performanceData.missedDays}
    
    Tone: ${tone}
    
    Rules:
    - Maximum 3-5 suggestions.
    - Focus on practical actions.
    - Detect behavior patterns (lazy, distracted, inconsistent).
    - Encourage discipline, not excuses.
    - Be slightly strict if performance is poor (<50%).
    
    Response Format (JSON):
    {
      "feedback": "A short, actionable feedback message",
      "tips": ["Tip 1", "Tip 2", "Tip 3"]
    }
  `;

  try {
    if (!ai) {
      throw new Error("GoogleGenAI not initialized. Check your API key.");
    }
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      feedback: "Stay focused and keep moving forward.",
      tips: ["Complete your priority tasks first.", "Limit phone usage.", "Stick to your routine."]
    };
  }
}

export async function getChatResponse(message: string, userName?: string | null): Promise<string> {
  const prompt = `
    You are Prince Chatbot, an AI assistant for the "Mindset" productivity app.
    The user's name is ${userName || 'User'}.
    
    Mindset App Features:
    - Task management (Today tab)
    - Routines (Routines tab)
    - Stats and Streaks (Stats tab)
    - AI Coaching (Feedback after completing the day)
    
    Goal: Help users find solutions to their productivity problems, explain how to use the app, and provide motivation.
    
    User Message: ${message}
    
    Prince Chatbot Response:
  `;

  try {
    if (!ai) {
      throw new Error("GoogleGenAI not initialized.");
    }
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "I'm here to help you stay focused and productive!";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "I'm currently offline, but I'm always here to support your journey to a better mindset!";
  }
}
