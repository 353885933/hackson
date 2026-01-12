
import { GoogleGenAI, Type } from "@google/genai";
import { BookAnalysis } from "../types";

// 调整后的风格后缀：强调电影感、光影和细节，去除强制的红黑色调限制
const STYLE_SUFFIX = ", cinematic movie still, 8k resolution, highly detailed, dramatic lighting, photorealistic, emotional atmosphere, wide shot, depth of field, visual storytelling.";

export const analyzeBookContent = async (text: string): Promise<BookAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `你是一个顶级的电影美术指导和视觉叙事专家。请对以下书籍片段进行深度电影化拆解。
    
    你的核心任务是将文字转化为具有强烈“电影质感”的视觉分镜。
    
    **视觉风格定义**：
    1. **真实感**：追求电影级的光影效果，而非抽象的插画。
    2. **色彩**：根据剧情内容自然呈现色彩。例如：火焰应该是炽热的橙红，大海应该是深邃的蓝黑，森林应该是层次丰富的绿色。
    3. **氛围**：构图要讲究，通过光影传达情绪。
    
    重点提取：
    1. **关键分镜标题**：简练有力。
    2. **叙事描写**：充满画面感的中文描述。
    3. **视觉暗示/伏笔**：对情节深处意象的解读。
    4. **视觉提示词 (visualPrompt)**：请编写英文 Prompt。**必须包含具体的画面描述**。例如："A giant wooden horse burning in the night, sparks flying, ancient city background, cinematic lighting."
    
    请使用中文回答（提示词除外）。
    文本内容：${text.substring(0, 15000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          author: { type: Type.STRING },
          summary: { type: Type.STRING },
          themes: { type: Type.ARRAY, items: { type: Type.STRING } },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                foreshadowing: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["title", "description", "foreshadowing", "visualPrompt"]
            }
          }
        },
        required: ["title", "author", "summary", "themes", "scenes"]
      }
    }
  });

  const jsonStr = response.text?.trim();
  if (!jsonStr) {
    throw new Error("The model did not return any readable content.");
  }
  return JSON.parse(jsonStr);
};

export const generateSceneImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 组合用户生成的 prompt 和通用电影风格后缀
  const finalPrompt = `${prompt} ${STYLE_SUFFIX}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: finalPrompt }]
    },
    config: {
      imageConfig: { aspectRatio: "16:9" }
    }
  });

  let imageUrl = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!imageUrl) {
    throw new Error("Image generation failed.");
  }
  
  return imageUrl;
};

export const generateSceneVideo = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 视频生成同样应用自然电影风格
  const finalPrompt = `${prompt} ${STYLE_SUFFIX}, slow motion, minimal movement, cinematic loop.`;

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: finalPrompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");

  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
