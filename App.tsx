
import React, { useState, useRef, useEffect } from 'react';
import { analyzeBookContent, generateSceneImage, generateSceneVideo } from './services/geminiService';
import { BookAnalysis, AppStatus, Scene } from './types';
import { UploadIcon, BookIcon, EyeIcon, SparkleIcon } from './components/Icons';

/**
 * 视觉风格参考：电影化叙事
 * 
 * Themes:
 * - Default: Saul Bass (Paper, Black, Red)
 * - Homer: Epic Classical (Marble, Deep Blue, Bronze)
 * - LotM: Victorian Steampunk (Soot, Fog, Crimson/Brass)
 */

type ThemeKey = 'default' | 'homer' | 'lotm';

const THEMES: Record<ThemeKey, { paper: string; ink: string; accent: string }> = {
  default: { 
    paper: '#F7F4EF', // 米白
    ink: '#1A1A1A',   // 墨黑
    accent: '#D94432' // 鲜红
  },
  homer: { 
    paper: '#F5F5F4', // 大理石灰白
    ink: '#0C4A6E',   // 地中海深蓝
    accent: '#D97706' // 青铜金
  },
  lotm: { 
    paper: '#0F0F0F', // 煤烟深黑
    ink: '#A8A29E',   // 雾气灰
    accent: '#9F1239' // 绯红 (Crimson)
  }
};

// Define the interface locally to avoid global declaration conflicts
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

type ViewState = 'home' | 'project' | 'creator';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [analysis, setAnalysis] = useState<BookAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('default');
  
  const exampleSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  // Apply Theme Variables
  useEffect(() => {
    const root = document.documentElement;
    const theme = THEMES[currentTheme];
    root.style.setProperty('--color-paper', theme.paper);
    root.style.setProperty('--color-ink', theme.ink);
    root.style.setProperty('--color-accent', theme.accent);
  }, [currentTheme]);

  const getAIStudio = (): AIStudio => {
    return (window as unknown as { aistudio: AIStudio }).aistudio;
  };

  const checkApiKey = async () => {
    try {
      const hasKey = await getAIStudio().hasSelectedApiKey();
      setNeedsKey(!hasKey);
    } catch (e) {
      console.error("Error checking API key status", e);
    }
  };

  const handleOpenKey = async () => {
    try {
      await getAIStudio().openSelectKey();
      setNeedsKey(false);
    } catch (e) {
      console.error("Error opening key selection", e);
    }
  };

  const navigateTo = (view: ViewState) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToExamples = () => {
    navigateTo('home');
    setTimeout(() => {
      exampleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // 重置应用状态（回到最初的上传界面）
  const reset = () => {
    setAnalysis(null);
    setStatus(AppStatus.IDLE);
    setError(null);
    setCurrentTheme('default'); // Reset theme
    navigateTo('home');
  };

  // 通用视觉生成逻辑 (图片 + 视频)
  const processVisuals = async (currentAnalysis: BookAnalysis) => {
    try {
      // Step 1: Images (Nano Banana)
      setStatus(AppStatus.GENERATING_IMAGES);
      const updatedScenes = [...currentAnalysis.scenes];
      
      for (let i = 0; i < updatedScenes.length; i++) {
        try {
          const imageUrl = await generateSceneImage(updatedScenes[i].visualPrompt);
          updatedScenes[i].image = imageUrl;
          // 仅在当前仍有分析结果时更新（防止用户中途重置）
          setAnalysis(prev => prev ? { ...prev, scenes: [...updatedScenes] } : null);
        } catch (imgErr) {
          console.error(`Image generation failed for scene ${i}`, imgErr);
        }
      }

      // Step 2: Videos (Veo)
      setStatus(AppStatus.GENERATING_VIDEOS);
      for (let i = 0; i < updatedScenes.length; i++) {
        try {
          const videoUrl = await generateSceneVideo(updatedScenes[i].visualPrompt);
          updatedScenes[i].videoUrl = videoUrl;
          setAnalysis(prev => prev ? { ...prev, scenes: [...updatedScenes] } : null);
        } catch (vErr: any) {
          // Parse error to check for Veo 404/Access Denied specifically
          const errorBody = vErr?.error || vErr;
          const errorMessage = errorBody?.message || JSON.stringify(vErr);
          
          const isEntityNotFound = 
            errorMessage.includes("Requested entity was not found") || 
            errorBody?.code === 404 || 
            errorMessage.includes("404") ||
            errorMessage.includes("NOT_FOUND");

          if (isEntityNotFound) {
             console.warn("Veo Model Access Error (404). Triggering API Key selection flow.");
             setNeedsKey(true);
             setError("需要有效的付费 API Key (Veo 模型)。请点击重新选择。");
             await handleOpenKey();
             
             setStatus(AppStatus.COMPLETED);
             return; 
          }
          
          console.error("Video generation failed for scene", i, vErr);
        }
      }

      setStatus(AppStatus.COMPLETED);
    } catch (err) {
      console.error(err);
      setError('视觉生成过程中发生错误。');
      setStatus(AppStatus.ERROR);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (needsKey) {
      await handleOpenKey();
    }

    navigateTo('home');
    setStatus(AppStatus.ANALYZING);
    setError(null);
    setCurrentTheme('default'); 

    try {
      const text = await file.text();
      const result = await analyzeBookContent(text);
      setAnalysis(result);
      await processVisuals(result);
    } catch (err) {
      console.error(err);
      setError('系统处理失败。请检查 API Key 或文件格式。');
      setStatus(AppStatus.ERROR);
    }
  };

  const loadExample = async (type: 'homer' | 'lotm') => {
    if (needsKey) {
      await handleOpenKey();
    }
    
    setAnalysis(null);
    setError(null);
    navigateTo('home');

    // setCurrentTheme(type);

    let exampleAnalysis: BookAnalysis;

    if (type === 'homer') {
      exampleAnalysis = {
        title: "奥德赛：史诗视觉重构",
        author: "荷马",
        summary: "在众神冷酷的注视下，奥德修斯穿越死亡与诱惑的海洋。这不仅是归乡之旅，更是一场血与墨的灵魂洗礼。",
        themes: ["宿命", "神性与人性", "血腥复仇"],
        scenes: [
          {
            title: "特洛伊的灰烬",
            description: "漆黑的夜幕下，巨大的木马轮廓如死神般矗立。燃烧的特洛伊城将天空染成惨烈的血红，黑色的烟尘吞噬了星辰。",
            foreshadowing: "胜利的火焰中，已经埋下了十年漂泊的诅咒。",
            visualPrompt: "A cinematic shot of the wooden horse of Troy silhouetted against a burning ancient city, sparks flying, night time, intense fire lighting, hyperrealistic, movie still.",
            image: undefined
          },
          {
            title: "塞壬的深渊",
            description: "墨黑色的死寂海面，苍白的雾气如同幽灵般缭绕。奥德修斯被捆绑在桅杆上，疯狂地挣扎，四周是无形却致命的歌声。",
            foreshadowing: "最迷人的诱惑，往往伴随着最深沉的毁灭。",
            visualPrompt: "A dark stormy ocean with huge waves, cinematic lighting, cold blue tones, mist, a wooden greek ship tossing in the storm, photorealistic.",
            image: undefined
          },
          {
            title: "血色的归乡",
            description: "大厅内，奥德修斯拉满长弓，肌肉紧绷如铁。复仇的箭矢划破凝固的空气，将求婚者的狂欢化为一场红色的葬礼。",
            foreshadowing: "所有的忍耐与等待，都在这一刻化为致命的审判。",
            visualPrompt: "Close up of an ancient greek archer drawing a bow, focus on the arrow tip, dramatic rim lighting, tense atmosphere, cinematic movie composition.",
            image: undefined
          }
        ]
      };
    } else {
      exampleAnalysis = {
        title: "诡秘之主：蒸汽与克苏鲁",
        author: "爱潜水的乌贼",
        summary: "在蒸汽与机械的浪潮中，周明瑞穿越到维多利亚时代的异世，化身克莱恩·莫雷蒂。通过扮演“愚者”，他在疯狂与理智的边缘试探，揭开世界底层的诡秘真相。",
        themes: ["蒸汽朋克", "克苏鲁神话", "扮演法", "人性"],
        scenes: [
          {
            title: "绯红的降临",
            description: "周明瑞在剧痛中醒来，眼前是陌生的维多利亚式房间。窗外是一轮妖异的绯红之月，桌上放着一把黄铜左轮手枪和那本写着“所有人都会死，包括我”的沾血笔记。",
            foreshadowing: "这场死亡并非终结，而是“愚者”神性觉醒的开始。",
            visualPrompt: "A victorian study room at night, moonlight shining through the window, a revolver on the desk, a notebook with blood stains, mysterious atmosphere, crimson moonlight, steampunk details, cinematic lighting.",
            image: undefined
          },
          {
            title: "灰雾之上的神殿",
            description: "无垠的灰白雾气之中，古老而巍峨的希腊式神殿耸立。克莱恩端坐在青铜长桌的尽头，被迷雾笼罩，如同俯瞰世间的神灵，开启了“塔罗会”的第一次召集。",
            foreshadowing: "这里是源堡，是旧日支配者的沉睡之地，也是克莱恩命运的最终归宿。",
            visualPrompt: "Endless gray fog, a majestic ancient greek style palace floating in the fog, a long bronze table, a mysterious figure sitting at the head of the table in shadow, ethereal atmosphere, epic scale, cinematic shot.",
            image: undefined
          },
          {
            title: "廷根的烟霾",
            description: "廷根市的烟霾下，煤气灯散发着昏黄的光晕。身穿黑色风衣、头戴半高丝绸礼帽的“值夜者”行走在阴影中。为了守护光明，他们不得不在此刻拥抱黑暗。",
            foreshadowing: "在这个世界，只有时刻警醒，才能在非凡的深渊旁保持人性，不至于彻底失控。",
            visualPrompt: "A foggy victorian street at night, gas street lamps, a man in a black trench coat and top hat walking away, mysterious shadows, steampunk city background, moody atmosphere, dark colors, cinematic composition.",
            image: undefined
          }
        ]
      };
    }

    setAnalysis(exampleAnalysis);
    
    setTimeout(() => {
      const scrollTarget = window.innerHeight * 0.6;
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }, 100);

    await processVisuals(exampleAnalysis);
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-[var(--color-accent)] selection:text-white transition-colors duration-700">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-[var(--color-paper)]/95 backdrop-blur-md border-b border-[var(--color-ink)]/10 px-6 py-4 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 transition-all duration-300 shadow-sm">
        {/* LOGO - Clicks reset to initial state */}
        <div className="flex items-center gap-4 cursor-pointer group" onClick={reset}>
          <div className="bg-[var(--color-accent)] w-3 h-3 md:w-4 md:h-4 group-hover:rotate-45 transition-transform duration-300"></div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase leading-none">
            BookVision<span className="text-[var(--color-accent)]">.</span>
          </h1>
        </div>
        
        <nav className="flex items-center gap-6 md:gap-8 text-[10px] md:text-xs font-bold uppercase tracking-[0.15em]">
          <button 
            onClick={() => navigateTo('home')} 
            className={`hover:text-[var(--color-accent)] transition-colors py-2 ${currentView === 'home' ? 'text-[var(--color-accent)]' : ''}`}
          >
            {analysis ? '当前解析' : '首页'}
          </button>
          
          <button 
            onClick={scrollToExamples} 
            className="hover:text-[var(--color-accent)] transition-colors py-2"
          >
            示例
          </button>
          
          <button 
            onClick={() => navigateTo('project')} 
            className={`hover:text-[var(--color-accent)] transition-colors py-2 ${currentView === 'project' ? 'text-[var(--color-accent)]' : ''}`}
          >
            项目介绍
          </button>
          
          <button 
            onClick={() => navigateTo('creator')} 
            className={`hover:text-[var(--color-accent)] transition-colors py-2 ${currentView === 'creator' ? 'text-[var(--color-accent)]' : ''}`}
          >
            创作者
          </button>
          
          {/* New Project Button - Only visible when analysis exists */}
          {analysis && (
            <button 
              onClick={reset}
              className="ml-2 bg-[var(--color-ink)] text-[var(--color-paper)] px-3 py-1 hover:bg-[var(--color-accent)] transition-colors"
            >
              + 新项目
            </button>
          )}
          
          {needsKey && (
            <button onClick={handleOpenKey} className="ml-2 text-[var(--color-accent)] animate-pulse border border-[var(--color-accent)] px-2 py-1">
              KEY
            </button>
          )}
        </nav>
      </header>

      <main className="flex-grow relative z-0">
        {/* VIEW: HOME */}
        {currentView === 'home' && (
          <>
            {/* Initial Upload State */}
            {(status === AppStatus.IDLE || status === AppStatus.ERROR) && !analysis && (
              <section className="px-6 md:px-24 py-20 animate-fade-in min-h-[80vh] flex flex-col justify-center">
                <div className="max-w-6xl mx-auto w-full">
                  <div className="relative mb-20">
                    <div className="inline-block bg-[var(--color-ink)] text-[var(--color-paper)] px-4 py-2 text-xs font-bold uppercase tracking-widest mb-6">
                      AI Visual Storytelling Engine
                    </div>
                    <h2 className="text-6xl md:text-[8rem] lg:text-[10rem] font-black leading-[0.85] uppercase tracking-tighter mb-8">
                      From Text <br/> 
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-ink)]">
                        To Cinema.
                      </span>
                    </h2>
                    <div className="max-w-xl border-l-4 border-[var(--color-ink)] pl-8 py-4 mt-12">
                      <p className="text-xl leading-relaxed opacity-80 font-light">
                        重新定义阅读体验。我们利用 Gemini 3 Pro 的深度理解能力与 Veo 的视频生成技术，
                        将静止的文字重构为具有呼吸感的电影分镜。
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-12">
                    <label className="group relative bg-[var(--color-ink)] text-[var(--color-paper)] px-12 py-6 md:px-16 md:py-8 cursor-pointer hover:bg-[var(--color-accent)] transition-all duration-500 overflow-hidden shadow-2xl self-start">
                      <div className="relative z-10 flex items-center gap-6">
                        <UploadIcon />
                        <span className="text-xl md:text-2xl font-black uppercase tracking-tighter">上传书籍文本</span>
                      </div>
                      <input type="file" className="hidden" accept=".txt,.pdf" onChange={handleFileUpload} />
                    </label>
                    
                    <div ref={exampleSectionRef} className="border-t border-[var(--color-ink)]/10 pt-8">
                       <span className="mono text-xs opacity-40 uppercase tracking-widest block mb-6">或 运行 AI 实时生成演示</span>
                       <div className="flex flex-wrap gap-6">
                         <button onClick={() => loadExample('homer')} className="group flex items-center gap-3 border border-[var(--color-ink)] px-6 py-4 hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-all duration-300">
                            <span className="text-sm font-bold uppercase tracking-widest">奥德赛 (Homer)</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                         </button>
                         <button onClick={() => loadExample('lotm')} className="group flex items-center gap-3 border border-[var(--color-ink)] px-6 py-4 hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-all duration-300">
                            <span className="text-sm font-bold uppercase tracking-widest">诡秘之主 (LotM)</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                         </button>
                       </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-12 p-6 border-l-4 border-[var(--color-accent)] bg-red-50 text-[var(--color-accent)] font-bold uppercase tracking-widest mono text-sm">
                      Error: {error}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Loading States */}
            {(status === AppStatus.ANALYZING || status === AppStatus.GENERATING_IMAGES || status === AppStatus.GENERATING_VIDEOS) && (
              <section className="px-6 md:px-24 py-40 flex flex-col items-center justify-center animate-fade-in text-center min-h-[80vh]">
                <div className="mb-12 relative">
                   <div className="w-32 h-32 border-8 border-[var(--color-ink)]/10 border-t-[var(--color-accent)] rounded-full animate-spin"></div>
                   <div className="absolute inset-0 flex items-center justify-center font-black text-2xl uppercase tracking-tighter">AI</div>
                </div>
                <h3 className="text-4xl md:text-6xl font-black uppercase mb-6 tracking-tighter">
                  {status === AppStatus.ANALYZING ? 'Deconstructing Logic' : 
                   status === AppStatus.GENERATING_IMAGES ? 'Rendering Frames' : 'Synthesizing Motion'}
                </h3>
                <div className="h-1 w-24 bg-[var(--color-ink)] mx-auto mb-6"></div>
                <p className="mono text-sm opacity-50 uppercase tracking-[0.3em] animate-pulse">
                  {status === AppStatus.ANALYZING ? 'Gemini 3 Pro Analyzing Context...' : 
                   status === AppStatus.GENERATING_IMAGES ? 'Nano Banana Generating Visuals...' : 'Veo Generating Cinematic Loops...'}
                </p>
                {status === AppStatus.GENERATING_VIDEOS && (
                  <p className="mt-4 text-xs text-[var(--color-accent)] font-bold uppercase tracking-widest border border-[var(--color-accent)] px-3 py-1">
                    High Compute Task Active
                  </p>
                )}
              </section>
            )}

            {/* Results */}
            {analysis && (status === AppStatus.COMPLETED || status === AppStatus.GENERATING_VIDEOS || status === AppStatus.GENERATING_IMAGES) && (
              <div className="animate-fade-in pb-32 relative">
                 {/* Error Banner when in Results View */}
                 {error && (
                    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[var(--color-accent)] text-white text-center py-4 px-4 font-bold uppercase tracking-widest cursor-pointer hover:opacity-90 transition-opacity shadow-[0_-4px_20px_rgba(0,0,0,0.3)]" onClick={handleOpenKey}>
                       <span className="mr-2">⚠</span> {error} <span className="underline decoration-2 ml-2">Click to Fix</span>
                    </div>
                 )}
              
                <section className="px-6 md:px-24 py-24 bg-[var(--color-ink)] text-[var(--color-paper)] relative overflow-hidden transition-colors duration-700">
                   <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
                      <div className="w-[50vw] h-[50vw] bg-[var(--color-accent)] rounded-full blur-[150px] absolute -top-[20%] -right-[10%]"></div>
                   </div>
                   <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
                     <div className="lg:col-span-8">
                       <h2 className="text-6xl md:text-[10rem] font-black uppercase leading-[0.85] tracking-tighter mb-8 break-words">
                         {analysis.title}
                       </h2>
                       <div className="flex flex-wrap gap-6 items-center border-t border-[var(--color-paper)]/20 pt-8">
                         <p className="text-2xl md:text-4xl font-serif italic text-[var(--color-accent)]">By {analysis.author}</p>
                         <div className="flex gap-2">
                            {analysis.themes.map((t, i) => (
                                <span key={i} className="mono text-[10px] border border-[var(--color-paper)]/40 px-2 py-1 uppercase tracking-widest hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] transition-colors cursor-default">{t}</span>
                            ))}
                         </div>
                       </div>
                     </div>
                     <div className="lg:col-span-4 flex flex-col justify-end">
                       <p className="text-lg md:text-xl leading-relaxed opacity-80 border-l-2 border-[var(--color-accent)] pl-6 font-light">
                         {analysis.summary}
                       </p>
                     </div>
                   </div>
                </section>

                <section className="px-6 md:px-24 py-32 space-y-48">
                  {analysis.scenes.map((scene, idx) => (
                    <SceneItem key={idx} scene={scene} index={idx} total={analysis.scenes.length} />
                  ))}
                </section>
                
                <div className="flex justify-center mt-24">
                  <button onClick={reset} className="text-sm font-bold uppercase tracking-widest border-b-2 border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors">
                    开始新的解析
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* VIEW: PROJECT INTRO */}
        {currentView === 'project' && (
          <section className="px-6 md:px-24 py-24 animate-fade-in pb-40">
            <div className="max-w-6xl mx-auto relative z-10">
              <h2 className="text-[15vw] md:text-[10rem] font-black uppercase leading-[0.8] tracking-tighter mb-20 opacity-5 select-none fixed top-40 right-10 -z-10 truncate max-w-full">
                BookVision
              </h2>
              
              <div className="space-y-32">
                {/* 1. Vision */}
                <div className="border-l-8 border-[var(--color-accent)] pl-8 md:pl-16 py-8">
                  <h3 className="mono text-sm uppercase tracking-widest text-[var(--color-accent)] mb-6 font-bold">01. 核心愿景 The Vision</h3>
                  <p className="text-3xl md:text-6xl font-black leading-tight mb-8">
                    "把深度阅读变成极致的视听享受。"
                  </p>
                  <p className="text-xl md:text-2xl font-serif italic opacity-80 leading-relaxed max-w-3xl">
                    在这个短视频横行、人们难以沉下心读书的时代，BookVision 致力于将晦涩的文字转化为“B站知识区/纪录片级”的高质量视频解说。我们不追求快餐式的 AI 生成，而是追求“安静的大卫”式的沉浸感、逻辑性和艺术性。
                  </p>
                </div>

                {/* 2. Problem */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
                   <div className="md:col-span-4">
                     <h3 className="text-4xl font-black uppercase mb-4 border-b-4 border-[var(--color-ink)] pb-4 inline-block">02. 痛点 The Friction</h3>
                   </div>
                   <div className="md:col-span-8 space-y-8">
                      <div className="flex gap-6 items-start">
                         <div className="text-[var(--color-accent)] text-2xl font-black">X</div>
                         <div>
                            <h4 className="text-xl font-bold mb-2">“电子榨菜”泛滥但低质</h4>
                            <p className="opacity-70">现有的 AI 视频大多是 “开局一张图，内容全靠编”，或者是画面与解说完全不搭的“缝合怪”。</p>
                         </div>
                      </div>
                      <div className="flex gap-6 items-start">
                         <div className="text-[var(--color-accent)] text-2xl font-black">X</div>
                         <div>
                            <h4 className="text-xl font-bold mb-2">读书门槛高</h4>
                            <p className="opacity-70">纯文字阅读缺乏画面感，现代人很难代入深度剧情。</p>
                         </div>
                      </div>
                      <div className="flex gap-6 items-start">
                         <div className="text-[var(--color-accent)] text-2xl font-black">X</div>
                         <div>
                            <h4 className="text-xl font-bold mb-2">AI 视频不可控</h4>
                            <p className="opacity-70">单纯使用 Video Gen 模型生成的视频往往角色崩坏、逻辑不连贯，无法用于长篇叙事。</p>
                         </div>
                      </div>
                   </div>
                </div>

                {/* 3. Solution */}
                <div className="bg-[var(--color-ink)] text-[var(--color-paper)] p-8 md:p-16 shadow-[20px_20px_0px_var(--color-accent)]">
                  <h3 className="mono text-xs uppercase tracking-widest text-[var(--color-accent)] mb-8 font-bold">03. 解决方案 The Solution</h3>
                  <h4 className="text-3xl md:text-5xl font-black mb-8">Spec-Driven AI Agent</h4>
                  <p className="text-lg md:text-xl leading-relaxed opacity-90 font-light max-w-4xl">
                    我们开发了一个像专业影视制作团队一样分工协作的 Agent 系统。
                    不仅仅是朗读，而是<span className="text-[var(--color-accent)] font-bold">深度解说</span>（像文学评论家一样拆解伏笔）；
                    不仅仅是配图，而是<span className="text-[var(--color-accent)] font-bold">语义对齐</span>（解说提到“红伞”，画面必须出现“红伞”）；
                    不仅仅是PPT，而是<span className="text-[var(--color-accent)] font-bold">电影运镜</span>（赋予静帧以生命）。
                  </p>
                </div>

                {/* 4. Tech Highlights */}
                <div>
                   <h3 className="text-4xl font-black uppercase mb-16 text-center">关键技术亮点 Core Innovations</h3>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Card 1 */}
                      <div className="border-2 border-[var(--color-ink)] p-8 hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-all duration-500 group">
                         <div className="text-4xl mb-6 group-hover:scale-110 transition-transform duration-500">🔗</div>
                         <h4 className="text-xl font-black uppercase mb-4">文画强对位<br/>Semantic Alignment</h4>
                         <p className="text-sm opacity-80 leading-relaxed">
                           独创的 "Micro-Beat" (微节拍) 分镜系统，将脚本细化到 5 秒一个颗粒度，确保画面精准还原解说内容。
                         </p>
                      </div>
                      {/* Card 2 */}
                      <div className="border-2 border-[var(--color-ink)] p-8 hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-all duration-500 group">
                         <div className="text-4xl mb-6 group-hover:scale-110 transition-transform duration-500">🔒</div>
                         <h4 className="text-xl font-black uppercase mb-4">全书一致性<br/>Consistency Lock</h4>
                         <p className="text-sm opacity-80 leading-relaxed">
                           Art Director Agent 提取全书统一的“视觉基调 Token”；Casting Agent 预先生成主角“定妆照”，确保主角在 100 个镜头里长得一样。
                         </p>
                      </div>
                      {/* Card 3 */}
                      <div className="border-2 border-[var(--color-ink)] p-8 hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-all duration-500 group">
                         <div className="text-4xl mb-6 group-hover:scale-110 transition-transform duration-500">🎥</div>
                         <h4 className="text-xl font-black uppercase mb-4">程序化运镜<br/>Programmatic Motion</h4>
                         <p className="text-sm opacity-80 leading-relaxed">
                           利用 Remotion + Ken Burns 效应。放弃不可控的纯 Video Gen，回归本质，对高清静帧进行编程控制，实现 4K 级视觉体验与极速渲染。
                         </p>
                      </div>
                   </div>
                </div>

                {/* 5. Summary */}
                <div className="text-center border-y border-[var(--color-ink)]/20 py-24">
                   <p className="text-2xl md:text-4xl font-black leading-tight max-w-5xl mx-auto">
                     "BookVision 是一个<span className="text-[var(--color-accent)]">AI 导演剪辑版</span>的电子书阅读器。<br/>
                     它用最可控的技术，实现了最极致的视听叙事。"
                   </p>
                </div>

              </div>
            </div>
          </section>
        )}

        {/* VIEW: CREATOR */}
        {currentView === 'creator' && (
          <section className="px-6 md:px-24 py-24 animate-fade-in min-h-[80vh] flex items-center justify-center">
             <div className="max-w-2xl w-full bg-[var(--color-paper)] p-12 md:p-20 shadow-[20px_20px_0px_rgba(0,0,0,0.2)] border-2 border-[var(--color-ink)] relative">
               <div className="absolute top-0 left-0 bg-[var(--color-accent)] text-white px-4 py-2 mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                 The Architect <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
               </div>
               
               <div className="text-center">
                 {/* Avatar */}
                 <div className="w-40 h-40 bg-[var(--color-ink)]/5 rounded-full mx-auto mb-8 border-4 border-[var(--color-ink)] overflow-hidden relative group">
                    <img
                        src="data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23F7F4EF%22%2F%3E%3Cpath%20d%3D%22M25%2040%20L15%2010%20L45%2030%20Z%22%20fill%3D%22%231a1a1a%22%2F%3E%3Cpath%20d%3D%22M75%2040%20L85%2010%20L55%2030%20Z%22%20fill%3D%22%231a1a1a%22%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2255%22%20r%3D%2230%22%20fill%3D%22%231a1a1a%22%2F%3E%3Cellipse%20cx%3D%2240%22%20cy%3D%2250%22%20rx%3D%225%22%20ry%3D%227%22%20fill%3D%22%23fff%22%2F%3E%3Cellipse%20cx%3D%2260%22%20cy%3D%2250%22%20rx%3D%225%22%20ry%3D%227%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2250%22%20r%3D%222%22%20fill%3D%22%23000%22%2F%3E%3Ccircle%20cx%3D%2260%22%20cy%3D%2250%22%20r%3D%222%22%20fill%3D%22%23000%22%2F%3E%3Cpath%20d%3D%22M47%2062%20L53%2062%20L50%2066%20Z%22%20fill%3D%22%23ffab91%22%2F%3E%3Cpath%20d%3D%22M50%2066%20Q42%2072%2038%2066%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222%22%20fill%3D%22none%22%2F%3E%3Cpath%20d%3D%22M50%2066%20Q58%2072%2062%2066%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E"
                        alt="Cartoon Cat"
                        className="w-full h-full object-cover"
                    />
                 </div>
                 
                 <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4">
                   Liz
                 </h2>
                 <p className="text-[var(--color-accent)] mono text-xs md:text-sm uppercase tracking-[0.2em] mb-8 font-bold">
                   算法工程师 // AI产品 // Agent开发
                 </p>
                 
                 <div className="h-px w-16 bg-[var(--color-ink)] mx-auto mb-8"></div>
                 
                 <div className="space-y-2 text-lg font-serif mb-12 opacity-90">
                    <p>🏆 秒哒黑客松上海线下赛第一名</p>
                    <p>🌟 豆包“一点都不技术”黑客松创作新星奖</p>
                    <p>🔍 观猹社区金牌观察员</p>
                 </div>
                 
                 {/* Recruitment Section */}
                 <div className="bg-[var(--color-ink)] text-[var(--color-paper)] p-6 mb-12 text-left relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--color-accent)] rotate-45 translate-x-8 -translate-y-8"></div>
                    <h3 className="mono text-xs text-[var(--color-accent)] font-bold uppercase tracking-widest mb-4">
                        // HIRING_CO-FOUNDER
                    </h3>
                    <p className="font-bold text-lg mb-2">招募伙伴 (Dev)</p>
                    <p className="text-sm opacity-80 leading-relaxed font-mono">
                        寻找志同道合的开发者。
                        <br/>
                        <span className="text-[var(--color-accent)]">></span> 善于解决 Bug
                        <br/>
                        <span className="text-[var(--color-accent)]">></span> 深刻理解模型边界与 Agent 架构
                        <br/>
                        <span className="text-[var(--color-accent)]">></span> Vibe Coding 玩家狂喜
                    </p>
                 </div>
                 
                 <div className="flex justify-center gap-8 text-sm font-bold uppercase tracking-widest">
                   <a href="#" className="hover:text-[var(--color-accent)] hover:underline decoration-2 underline-offset-4">GitHub</a>
                   <a href="#" className="hover:text-[var(--color-accent)] hover:underline decoration-2 underline-offset-4">Twitter</a>
                   <a href="#" className="hover:text-[var(--color-accent)] hover:underline decoration-2 underline-offset-4">Email</a>
                 </div>
               </div>
             </div>
          </section>
        )}
      </main>
    </div>
  );
};

const SceneItem: React.FC<{ scene: Scene; index: number; total: number }> = ({ scene, index, total }) => {
  const isEven = index % 2 === 0;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (scene.videoUrl && videoRef.current) {
      videoRef.current.play().catch(e => console.log("Auto-play blocked or failed", e));
    }
  }, [scene.videoUrl]);

  return (
    <div id={`scene-${index}`} className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-16 items-start group`}>
      <div className="flex-1 w-full">
        <div className="relative">
          <div className="absolute -top-12 -left-8 text-[10rem] md:text-[15rem] font-black opacity-5 leading-none select-none z-0">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div className="relative z-10 aspect-[16/9] bg-black overflow-hidden shadow-[10px_10px_0px_rgba(217,68,50,0.1)] group-hover:shadow-[20px_20px_0px_rgba(217,68,50,0.5)] transition-all duration-700">
            {scene.videoUrl ? (
              <video 
                ref={videoRef}
                src={scene.videoUrl} 
                className="w-full h-full object-cover transition-all duration-1000"
                loop
                muted
                playsInline
              />
            ) : scene.image ? (
              <img 
                src={scene.image} 
                alt={scene.title} 
                className="w-full h-full object-cover transition-all duration-1000 animate-fade-in"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center flex-col gap-4 bg-black/50 border border-white/10">
                <div className="w-12 h-12 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin"></div>
                <span className="mono text-[10px] uppercase tracking-widest opacity-60 text-white">Nano Banana Generating...</span>
              </div>
            )}
            
            {scene.videoUrl && (
               <div className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-md text-white px-3 py-1 text-[10px] mono uppercase tracking-widest font-bold">
                 Cinematic Reel // Veo
               </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 space-y-8 pt-12">
        <div>
          <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 group-hover:text-[var(--color-accent)] transition-colors">
            {scene.title}
          </h3>
          <div className="h-2 w-32 bg-[var(--color-accent)]"></div>
        </div>
        
        <p className="text-xl md:text-2xl font-light leading-relaxed">
          {scene.description}
        </p>
        
        <div className="bg-[var(--color-ink)] text-[var(--color-paper)] p-8 md:p-10 saul-bass-cutout relative">
          <h4 className="mono text-xs uppercase text-[var(--color-accent)] font-black mb-4 tracking-[0.3em]">
            Deep Foreshadowing // 深层伏笔
          </h4>
          <p className="text-base md:text-lg leading-relaxed italic opacity-80 border-l border-[var(--color-paper)]/20 pl-6">
            “{scene.foreshadowing}”
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
