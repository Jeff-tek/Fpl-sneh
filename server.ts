// Local development entry point. The app itself lives in api/index.ts so the
// Vercel serverless function can stay self-contained (see the note there).
// Run with `npm run dev` (tsx watch) or `npm start`.
import app from './api/index.ts'

const port = Number(process.env.PORT || 3001)

app.listen(port, '0.0.0.0', () => {
  console.log(`FPL sneh server listening on http://0.0.0.0:${port}`)
})
