# LAWIZ'S Media Generator v1.57

Welcome to LAWIZ'S Media Generator, a powerful and versatile web application designed for creating stunning images and videos using state-of-the-art AI models. This tool provides a unified interface to interact with both Google's Gemini API and a self-hosted ComfyUI backend, offering a wide range of creative possibilities for both novice and advanced users.

## Key Features

### 1. Core Technology & State Management
- **Redux Toolkit Integration:** The entire application state is managed by Redux Toolkit, providing a single source of truth, predictable state updates, and improved performance.
- **Dual AI Backends:**
  - **Google Gemini:** Leverage `gemini-2.5-flash-image` for sophisticated image editing (pose manipulation, clothing changes), `imagen` for high-quality previews, and `veo` for video generation.
  - **ComfyUI Integration:** Connect directly to your local or remote ComfyUI instance to run complex, node-based workflows. The UI dynamically loads your installed models, samplers, and LoRAs.
- **Dynamic Header Context:** The application header intelligently displays the currently active AI Provider (Gemini vs. ComfyUI) and the specific model being used for every tool, ensuring you always know which engine is powering your creativity.

### 2. Advanced Image Generation
- **Multi-Provider Support:** Seamlessly switch between Gemini and ComfyUI for image generation.
- **Rich Configuration:** Fine-tune every aspect of your creation, including aspect ratio, artistic style, photo era, and number of images.
- **Expanded ComfyUI Workflow Support:** Out-of-the-box support for SD 1.5, SDXL, FLUX, WAN 2.2, Nunchaku Kontext FLUX (i2i), Nunchaku FLUX Image, FLUX Krea, Face Detailer, and Qwen T2I GGUF.
- **Post-Processing:** Enhance the resolution and quality of generated images with a single click using the Gemini API.

### 3. AI-Powered Video Generation
- **Dual Provider Support:** Generate video using either Google's `veo-2.0` model or a ComfyUI workflow.
- **Image-to-Video:** Animate a static image by providing a start frame, an optional end frame, and a text prompt to guide the motion.
- **WAN 2.2 I2V Workflow:** Utilizes the powerful WAN 2.2 Image-to-Video workflow in ComfyUI for high-quality, smooth video generation.
- **Detailed Video Controls:** Configure frame count, frame rate, CFG, steps, and post-processing effects like film grain.

### 4. Creative Suite
- **Character/Poses Generator:** A dedicated tab for creating and iterating on characters using Gemini's powerful Image-to-Image capabilities, with advanced pose control and AI name suggestions.
- **Past Forward:** A time-travel experience reimagining photos in different decades (1950s-2000s). Now featuring a fully integrated UI consistent with the main application.
- **Group Photo Fusion:** A groundbreaking feature that merges multiple individual photos into a single, cohesive group shot. Upload 2-4 photos, select a scenario (e.g., "Casual Hangout", "Cinematic Portrait"), and let the AI intelligently combine them.
- **Logo & Theme Generator:** A full suite for brand identity design.
  - **AI Logo Creation:** Generate unique logos from text, brand names, and slogans.
  - **Banner & Album Cover Design:** Create banners and 1:1 album covers with precise control over text, styles, and format.
  - **Precise Font Control:** Upload a reference image to replicate specific typography styles.

### 5. AI-Powered Extractor & Utility Tools
- **Extractor Tools Suite:** A versatile tab for isolating and recreating elements from a source image.
  - **Visual Results Grid:** A responsive, interactive grid displaying generated assets. Hover over items to instantly Download (Image, Skeleton, JSON) or Save to Library without opening a modal.
  - **Clothes & Object Extractor:** AI detects clothing items or objects and generates professional "product shots".
  - **Pose Extractor:** Uses MediaPipe to detect poses and generate ControlNet-compatible JSON skeletons or apply the pose to stylized mannequins.
  - **Font Extractor:** Identifies a font style from an image and generates a full A-Z, 0-9 character chart.
- **Media Tools:**
  - **Frame Extractor:** Scrub through videos and save high-quality frames.
  - **Color Palette Extractor:** Extract and refine color palettes from images.
  - **Resize & Crop:** Interactive tool to resize and crop images with aspect ratio constraints.

### 6. Hybrid Local & Cloud Library
- **Persistent Local Storage:** Save generated items to a persistent local library (IndexedDB).
- **Google Drive Sync:** Securely sync your entire library to Google Drive for cloud storage and cross-device access.
- **AI Auto-Naming:** Items are intelligently named by AI before saving, keeping your library organized.
- **One-Click Restoration:** Load any item from the library to instantly restore the entire generation setup (prompts, models, settings).

### 7. User Experience & Admin Tools
- **User Authentication:** Secure login system with roles for regular users and administrators.
- **Admin Panel:** Manage the user base (add/delete users).
- **Intelligent Prompting Tools:** Tools to generate descriptive prompts from images, extract background/subject descriptions, and mix "Prompt Soups".
- **Responsive UI:** A sleek, modern interface with multiple themes (Cyberpunk, Synthwave, Studio Light, 70s Groove).

## How to Use

1.  **Login:** Enter your credentials to access the application.
2.  **Select a Tool:** Use the navigation tabs to choose a tool (Image Generator, Video Generator, Extractor Tools, etc.).
3.  **Configure & Provide Inputs:** Upload source media, configure the AI backend, and adjust settings.
4.  **Generate:** Click "Generate" to begin processing.
5.  **View & Save Results:** Results appear in the main content area. Use the overlay buttons to quickly Download or Save, or click an item for a detailed view.

## Installation & Running (Desktop App)

This application is now a standalone Electron desktop app, offering better performance and local integration.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run in Development Mode:**
    ```bash
    npm run electron:dev
    ```

3.  **Build Executable:**
    ```bash
    npm run electron:build
    ```

## Setup Requirements

-   **Google Gemini API Key:** Required.
    -   **Desktop App:** Enter your key directly in the app's **Settings** menu. It is stored securely on your local machine.
    -   **Web Mode:** Configure as an environment variable `API_KEY`.
-   **Google Cloud OAuth Client ID (Optional):** Required for Google Drive sync. Follow the in-app guide to configure this.
-   **ComfyUI Instance (Optional):** Required for ComfyUI features. The desktop app connects directly to `http://127.0.0.1:8188` (or your custom URL) without CORS configuration.