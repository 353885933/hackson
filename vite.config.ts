import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载环境变量 (包括 Vercel 设置的 API_KEY)
  // Use (process as any).cwd() to resolve the current working directory, avoiding the TypeScript error.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // 这里非常关键：我们将 Vercel 构建环境中的 API_KEY 注入到前端代码中
    // 这样代码里的 process.env.API_KEY 就能在浏览器中正常工作了
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});