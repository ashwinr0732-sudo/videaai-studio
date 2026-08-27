# VideaAI Studio

Build a modern SaaS web application called "VideaAI".



The product is an AI media creation platform focused initially on AI video generation.



IMPORTANT:

- Build a functional web application, not just a landing page.

- Use a clean, premium, modern interface.

- Make it responsive for desktop and mobile.

- Do not use fake video-generation functionality yet.

- Structure the application so a real AI video-generation API can be connected securely later.



Create these pages:



1. Landing page

- Product name: VideaAI

- Hero headline: "Turn your ideas into videos."

- Subtitle explaining that users can generate AI videos from text prompts.

- "Create Video" CTA

- Pricing section

- Simple feature section



2. Dashboard

- Sidebar navigation:

  - Create

  - My Projects

  - Pricing

  - Settings

- Show user's available generation credits.

- Clean dark premium design.



3. Create page

- Large prompt textarea.

- Placeholder:

  "Describe the video you want to create..."

- Duration selector:

  5 seconds

  10 seconds

  30 seconds

- Aspect ratio:

  9:16

  16:9

  1:1

- Style selector:

  Cinematic

  Realistic

  Anime

  3D

  Animation

- Generate Video button.

- Generation progress area.



4. Projects page

- Display generated projects in cards.

- Each card should show thumbnail, title, status and date.

- Clicking a project opens its detail page.



5. Project detail page

- Large video player area.

- Project title.

- Prompt used.

- Download button.

- Regenerate button.



6. Authentication

- Create login and signup pages.

- Structure authentication so it can later connect to Supabase.



7. Database-ready architecture

Create a clean structure for:

- users

- projects

- generations

- credits



Use TypeScript and reusable React components.



Do not expose API keys in frontend code.



Make the UI polished enough to look like a real startup product.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a8979e7e-e455-4e20-9d0d-fb109945670d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
