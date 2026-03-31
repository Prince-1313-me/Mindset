import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
