# Lawiz's AI Media Generator v1.48

Welcome to Lawiz's AI Media Generator, a powerful and versatile web application designed for creating stunning images and videos using state-of-the-art AI models. This tool provides a unified interface to interact with both Google's Gemini API and a self-hosted ComfyUI backend, offering a wide range of creative possibilities for both novice and advanced users.

## Key Features

### 1. Dual AI Backends
- **Google Gemini:** Leverage Google's powerful `gemini-2.5-flash-image-preview` model for sophisticated image-to-image editing, including pose manipulation, clothing changes, background replacement, and style transfers. It also uses the `imagen` model for high-quality previews.
- **ComfyUI Integration:** Connect directly to your local or remote ComfyUI instance to run complex, node-based workflows. The UI dynamically loads your installed models, samplers, and LoRAs.

### 2. Advanced Image Generation
- **Multi-Provider Support:** Seamlessly switch between Gemini and ComfyUI for image generation.
- **Rich Configuration:** Fine-tune every aspect of your creation, including aspect ratio, artistic style, photo era, and number of images.
- **ComfyUI Workflow Support:** The UI dynamically loads your installed models, samplers, and LoRAs, with out-of-the-box support for popular workflows including SD 1.5, SDXL, FLUX, WAN 2.2, Nunchaku Kontext FLUX (i2i), Nunchaku FLUX Image, and FLUX Krea.
- **Post-Processing:** Enhance the resolution and quality of generated images with a single click using the Gemini API.

### 3. AI-Powered Video Generation
- **Image-to-Video:** Animate a static image by providing a start frame, an optional end frame, and a text prompt to guide the motion.
- **WAN 2.2 I2V Workflow:** Utilizes the powerful WAN 2.2 Image-to-Video workflow in ComfyUI for high-quality, smooth video generation.
- **Detailed Video Controls:** Configure frame count, frame rate, CFG, steps, and post-processing effects like film grain.
- **Improved Reliability:** Fixed a critical bug that caused the video generator to fail on load. The workflow now initializes with correct, sensible defaults, making it more reliable and user-friendly.

### 4. Dedicated Character/Poses Generator
- **Focused Workflow:** A dedicated tab for creating and iterating on characters using Gemini's powerful Image-to-Image capabilities.
- **AI Name Suggestion:** After generating a character, the AI can suggest a fitting name, adding a creative touch to your creations.
- **Advanced Pose Control (Gemini):** Choose from a list of professional presets, write your own custom poses, or let the AI generate random ones.
- **Clothing & Background Customization (Gemini):** Keep the original, replace from a reference image, or describe new clothing and backgrounds with text prompts. You can even preview AI-generated clothing and backgrounds before committing to a full generation.

### 5. Logo & Theme Generator
A full creative suite for brand identity design.

- **AI Logo Creation:** Generate unique, professional logos from text descriptions, brand names, and slogans. Fine-tune your logo by selecting from various styles (e.g., Symbolic, Wordmark, 3D Clay, Vaporwave), providing visual inspiration images, and applying color palettes saved in your library.
- **Banner Generator:** Design eye-catching banners for social media, websites, or advertisements. Combine text, logos, and imagery for impactful visuals with various aspect ratios and styles.
- **Album Cover Generator:** Design the perfect 1:1 album cover for your music. Specify genre, era (50s, 80s, modern, etc.), and media type (Vinyl, CD, Digital) for a pitch-perfect result. A special "vinyl wear" effect can be added to create an authentic, aged look.

### 6. AI-Powered Extractor Tools
This versatile tab combines powerful AI utilities for isolating and recreating elements from within a source image.

- **Clothes Extractor:**
  - **AI Clothing Identification:** Upload a photo and let the AI automatically detect all clothing items.
  - **E-commerce Product Shots:** For each item found, generate professional product shots: one laid out flat and an optional neatly folded version, perfect for online stores or catalogs.
  - **Fine-Tuning:** Provide optional text hints to improve accuracy and choose to exclude accessories for more focused results.

- **Object Extractor:**
  - **AI Object Detection:** Identify multiple distinct objects within a complex scene (like a garage sale or a busy room).
  - **Photorealistic Cutouts:** Generate clean, photorealistic images of each selected object on a plain white background.
  - **Controlled Extraction:** Specify the maximum number of objects to find and provide hints to guide the AI's focus.

- **Pose Extractor:**
  - **Accurate Pose Detection:** Utilizes MediaPipe to detect one or more human poses in an image, generating a ControlNet-compatible JSON skeleton.
  - **Reliable Pose Transfer:** Employs a new 'Pose Transfer' AI technique that accurately applies the detected pose to a mannequin figure, resolving previous issues where the AI would get confused by clothing or background elements.
  - **Stylized Mannequins:** Choose from several built-in mannequin styles (e.g., Wooden Artist, Wireframe, Neutral 3D) or upload your own custom reference image for a unique look.
  - **Multiple Outputs:** Save the generated mannequin, the skeleton visualization, and the raw pose data directly to your library for later use in other projects.

### 7. Video & Color Utilities
- **Frame Extractor:** Upload any video and use a precise slider to select and save any frame as a high-quality JPEG image. Includes a quick button to instantly save the very last frame, perfect for creating video continuations.
- **Color Palette Extractor:** Upload an image to automatically extract a beautiful color palette. You can customize the number of colors, re-shuffle the palette from a pool of dominant colors, or use an eyedropper to manually pick new colors from the source image. Palettes can be named and saved directly to the library.

### 8. Hybrid Local & Cloud Library
- **Auto-Naming:** Generated items are now intelligently named by AI before being saved. Prompts are summarized, and images/videos are given descriptive titles, keeping your library effortlessly organized.
- **Expanded Item Support:** The library now supports new types, including `logo`, `banner`, `album-cover`, `object`, `extracted-frame`, `color-palette`, and `pose`, in addition to images, videos, characters, and clothes.
- **Local Storage First:** Save any generated item to a persistent local library in your browser for fast access.
- **Google Drive Sync:** Securely connect your Google Drive account to sync your entire library for persistent, cloud-based storage.
- **Robust Architecture:** The Drive integration uses a central `library.json` file as an index for all media items, ensuring robust and efficient synchronization.
- **Automatic Organization:** The app automatically creates and manages subfolders within your selected Drive directory to keep your media organized.
- **AI-Generated Previews:** Hover over any saved prompt to see a unique, AI-generated thumbnail that visually represents its content. Previews are generated on-demand, cached locally, and synced with Google Drive.
- **Smart Syncing:** Download only new items from Drive to your local library, preventing duplicates and ensuring your collection is always up-to-date.
- **Complete State Capture:** The library stores not just the media, but also the exact prompts, models, and settings used to create it.
- **One-Click Restoration:** Load any item from the library to instantly restore the entire generation setup, making it easy to iterate or create variations.

### 9. Intelligent Prompting Tools (Admin)
- **Prompt from Image:** Automatically generate a descriptive text prompt from an uploaded image, optimized for different model types (SD1.5, SDXL, FLUX).
- **Element Extraction:** Isolate and generate prompts for just the background or the main subject of an image.
- **Magical Prompt Soup:** Creatively merge multiple prompt ideas (e.g., a subject from one image, a background from another) into a unique, cohesive new prompt.

### 10. Robust User Experience
- **User Authentication:** Secure login system with roles for regular users and administrators.
- **Admin Panel:** Administrators can manage the user base by adding or deleting users.
- **Responsive & Thematic UI:** A sleek, modern interface that works across devices, with multiple themes (Cyberpunk, Synthwave, etc.) to customize your workspace.
- **Real-Time Feedback:** Live progress bars and status messages keep you informed during the generation process.

## How to Use

1.  **Login:** Enter your credentials to access the application.
2.  **Select a Tool:** Choose between the various generator tabs, the Library, Extractor Tools, or Video Utilities.
3.  **Configure & Provide Inputs:**
    -   **Generators:** Upload source media, configure the AI backend (Gemini/ComfyUI), write prompts, and adjust detailed settings in the left-hand panel.
    -   **Extractor Tools:** Upload a single photo for the Clothes, Object, or Pose Extractor, and optionally add descriptive text to improve accuracy.
    -   **Video Utilities:** Upload a video to use the frame extractor or an image for the color palette extractor.
4.  **Generate:** Click the "Generate" or other relevant action button to begin processing.
5.  **View & Save Results:** Your generated media will appear on the right. You can download them, enhance them (for images), save them to your library, or use an image as a new source.

## Setup Requirements

-   **Google Gemini API Key:** The application requires a Google Gemini API key. This must be configured as an environment variable named `API_KEY` in the deployment environment. The application includes an in-app guide to help you correctly configure your key's "HTTP referrer" restrictions in the Google Cloud Console, which is crucial for it to work.
-   **Google Cloud OAuth Client ID (Optional):** To enable Google Drive library syncing, you must create an OAuth 2.0 Client ID in your Google Cloud project. The application provides a detailed, step-by-step guide to help you configure this, including setting the correct URIs.
-   **ComfyUI Instance (Optional):** To use the ComfyUI features, you must have a running instance of ComfyUI accessible from your browser. You will need to configure the URL to your instance within this application's settings. For certain workflows (e.g., WAN 2.2, Nunchaku), you may need to install specific custom nodes via the ComfyUI Manager.