# Lawiz's AI Media Generator

Welcome to Lawiz's AI Media Generator, a powerful and versatile web application designed for creating stunning images and videos using state-of-the-art AI models. This tool provides a unified interface to interact with both Google's Gemini API and a self-hosted ComfyUI backend, offering a wide range of creative possibilities for both novice and advanced users.

## Key Features

### 1. Dual AI Backends
- **Google Gemini:** Leverage Google's powerful `gemini-2.5-flash-image-preview` model for sophisticated image-to-image editing, including pose manipulation, clothing changes, background replacement, and style transfers. It also uses the `imagen` model for high-quality previews.
- **ComfyUI Integration:** Connect directly to your local or remote ComfyUI instance to run complex, node-based workflows. The UI dynamically loads your installed models, samplers, and LoRAs.

### 2. Advanced Image Generation
- **Multi-Provider Support:** Seamlessly switch between Gemini and ComfyUI for image generation.
- **Rich Configuration:** Fine-tune every aspect of your creation, including aspect ratio, artistic style, photo era, and number of images.
- **Pose Control (Gemini):** Choose from a list of professional presets, write your own custom poses, or let the AI generate random ones.
- **Clothing & Background Customization (Gemini):** Keep the original, replace from a reference image, or describe new clothing and backgrounds with text prompts. You can even preview AI-generated clothing and backgrounds before committing to a full generation.
- **ComfyUI Workflow Support:** Out-of-the-box support for various popular ComfyUI workflows, including SD1.5, SDXL, FLUX, WAN 2.2, and Nunchaku.
- **Post-Processing:** Enhance the resolution and quality of generated images with a single click using the Gemini API.

### 3. AI-Powered Video Generation
- **Image-to-Video:** Animate a static image by providing a start frame, an optional end frame, and a text prompt to guide the motion.
- **WAN 2.2 I2V Workflow:** Utilizes the powerful WAN 2.2 Image-to-Video workflow in ComfyUI for high-quality, smooth video generation.
- **Detailed Video Controls:** Configure frame count, frame rate, CFG, steps, and post-processing effects like film grain.

### 4. Hybrid Local & Cloud Library
- **Local Storage First:** Save any generated image, video, or clothing item to a persistent local library in your browser for fast access.
- **Google Drive Sync:** Securely connect your Google Drive account to sync your entire library for persistent, cloud-based storage.
- **Automatic Organization:** The app automatically creates and manages `images`, `videos`, and `clothes` subfolders within your selected Drive directory.
- **Smart Syncing:** Download only new items from Drive to your local library, preventing duplicates and ensuring your collection is always up-to-date.
- **Complete State Capture:** The library stores not just the media, but also the exact prompts, models, and settings used to create it.
- **One-Click Restoration:** Load any item from the library to instantly restore the entire generation setup, making it easy to iterate or create variations.

### 5. Video Utilities
- **Frame Extractor:** Upload a video and use a precise slider to select and save any frame as a high-quality JPEG image. Includes a quick button to instantly save the very last frame, perfect for creating video continuations.

### 6. Intelligent Prompting Tools (Admin)
- **Prompt from Image:** Automatically generate a descriptive text prompt from an uploaded image, optimized for different model types (SD1.5, SDXL, FLUX).
- **Element Extraction:** Isolate and generate prompts for just the background or the main subject of an image.
- **Magical Prompt Soup:** Creatively merge multiple prompt ideas (e.g., a subject from one image, a background from another) into a unique, cohesive new prompt.

### 7. Clothes Extractor Utility
- **AI Clothing Identification:** Upload a photo and let the AI automatically detect all clothing items and accessories.
- **E-commerce Product Shots:** For each item found, the AI generates two professional product shots: one laid out flat and one neatly folded, ready for online stores or catalogs.
- **Accuracy Boost:** Provide optional text details to help the AI better identify specific or obscured items.

### 8. Robust User Experience
- **User Authentication:** Secure login system with roles for regular users and administrators.
- **Admin Panel:** Administrators can manage the user base by adding or deleting users.
- **Generation History:** Automatically saves your generations (source image, settings, and results) to local storage, allowing you to review and reload previous sessions.
- **Responsive & Thematic UI:** A sleek, modern interface that works across devices, with multiple themes (Cyberpunk, Synthwave, etc.) to customize your workspace.
- **Real-Time Feedback:** Live progress bars and status messages keep you informed during the generation process.

## How to Use

1.  **Login:** Enter your credentials to access the application.
2.  **Select a Tool:** Choose between the **Image Generator**, **Video Generator**, **Library**, **Clothes Extractor**, or **Video Utilities** tabs.
3.  **Configure & Provide Inputs:**
    -   **Image/Video Gen:** Upload source media, configure the AI backend (Gemini/ComfyUI), write prompts, and adjust detailed settings in the left-hand panel.
    -   **Clothes Extractor:** Upload a single photo and optionally add descriptive text to improve accuracy.
    -   **Video Utilities:** Upload a video to use the frame extractor.
4.  **Generate:** Click the "Generate" or other relevant action button to begin processing.
5.  **View & Save Results:** Your generated media will appear on the right. You can download them, enhance them (for images), save them to your library, or use an image as a new source.

## Setup Requirements

-   **Google Gemini API Key:** The application requires a Google Gemini API key. This must be configured as an environment variable named `API_KEY` in the deployment environment. The application includes an in-app guide to help you correctly configure your key's "HTTP referrer" restrictions in the Google Cloud Console, which is crucial for it to work.
-   **Google Cloud OAuth Client ID (Optional):** To enable Google Drive library syncing, you must create an OAuth 2.0 Client ID in your Google Cloud project. The application provides a detailed, step-by-step guide to help you configure this, including setting the correct URIs.
-   **ComfyUI Instance (Optional):** To use the ComfyUI features, you must have a running instance of ComfyUI accessible from your browser. You will need to configure the URL to your instance within this application's settings. For certain workflows (e.g., WAN 2.2, Nunchaku), you may need to install specific custom nodes via the ComfyUI Manager.