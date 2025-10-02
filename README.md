# Lawiz's AI Media Generator v1.50

Welcome to Lawiz's AI Media Generator, a powerful and versatile web application designed for creating stunning images and videos using state-of-the-art AI models. This tool provides a unified interface to interact with both Google's Gemini API and a self-hosted ComfyUI backend, offering a wide range of creative possibilities for both novice and advanced users.

## Key Features

### 1. Core Technology & State Management
- **Redux Toolkit Integration:** The entire application state is now managed by Redux Toolkit, providing a single source of truth, predictable state updates, and improved performance and maintainability.
- **Dual AI Backends:**
  - **Google Gemini:** Leverage Google's powerful `gemini-2.5-flash-image-preview` model for sophisticated image-to-image editing, including pose manipulation, clothing changes, background replacement, and style transfers. It also uses the `imagen` model for high-quality previews and `veo` for video generation.
  - **ComfyUI Integration:** Connect directly to your local or remote ComfyUI instance to run complex, node-based workflows. The UI dynamically loads your installed models, samplers, and LoRAs.

### 2. Advanced Image Generation
- **Multi-Provider Support:** Seamlessly switch between Gemini and ComfyUI for image generation.
- **Rich Configuration:** Fine-tune every aspect of your creation, including aspect ratio, artistic style, photo era, and number of images.
- **Expanded ComfyUI Workflow Support:** The UI dynamically loads your installed models, with out-of-the-box support for popular workflows including SD 1.5, SDXL, FLUX, WAN 2.2, Nunchaku Kontext FLUX (i2i), Nunchaku FLUX Image, FLUX Krea, and a powerful **Face Detailer** workflow for enhancing and fixing faces in existing images.
- **Post-Processing:** Enhance the resolution and quality of generated images with a single click using the Gemini API.

### 3. AI-Powered Video Generation
- **Dual Provider Support:** Generate video using either Google's `veo-2.0` model or a ComfyUI workflow.
- **Image-to-Video:** Animate a static image by providing a start frame, an optional end frame, and a text prompt to guide the motion.
- **WAN 2.2 I2V Workflow:** Utilizes the powerful WAN 2.2 Image-to-Video workflow in ComfyUI for high-quality, smooth video generation.
- **Detailed Video Controls:** Configure frame count, frame rate, CFG, steps, and post-processing effects like film grain.

### 4. Creative Suite
- **Character/Poses Generator:** A dedicated tab for creating and iterating on characters using Gemini's powerful Image-to-Image capabilities, with advanced pose control and AI name suggestions.
- **Logo & Theme Generator:** A full suite for brand identity design.
  - **AI Logo Creation:** Generate unique logos from text, brand names, and slogans. Fine-tune with styles (e.g., Symbolic, 3D Clay), visual inspiration, and color palettes.
  - **Banner & Album Cover Design:** Create banners and 1:1 album covers with precise control over text, logos, styles, and media formats (e.g., emulating a vinyl sleeve with realistic wear and tear).
  - **Precise Font Control:** Provide a direct visual reference for typography by uploading an image or selecting a pre-extracted font chart from your library for the AI to replicate.

### 5. AI-Powered Extractor & Utility Tools
- **Extractor Tools Suite:** A versatile tab combining powerful utilities for isolating and recreating elements from a source image.
  - **Clothes & Object Extractor:** AI automatically detects clothing items or objects and generates professional "product shots" on a clean white background.
  - **Pose Extractor:** Utilizes MediaPipe for accurate pose detection, generating a ControlNet-compatible JSON skeleton. A robust 'Pose Transfer' AI technique applies the pose to various stylized mannequins.
  - **Font Extractor:** Identifies a font style from an image and generates a full A-Z, 0-9 character chart.
- **Video & Color Utilities:**
  - **Frame Extractor:** Upload any video to select and save any frame as a high-quality JPEG.
  - **Color Palette Extractor:** Upload an image to automatically extract a beautiful color palette, which can be refined with an eyedropper and saved to the library.

### 6. Hybrid Local & Cloud Library
- **Persistent Local Storage:** Save any generated item to a persistent local library in your browser (IndexedDB) for fast access.
- **Google Drive Sync:** Securely connect your Google Drive account to sync your entire library for persistent, cloud-based storage and access across devices.
- **AI Auto-Naming:** Generated items are intelligently named by AI before being saved. Prompts are summarized, and images/videos are given descriptive titles, keeping your library effortlessly organized.
- **Expanded Item Support:** The library now supports new types, including `logo`, `banner`, `album-cover`, `object`, `extracted-frame`, `color-palette`, `pose`, and `font`.
- **One-Click Restoration:** Load any item from the library to instantly restore the entire generation setup—including prompts, models, and all settings—making it easy to iterate or create variations.

### 7. User Experience & Admin Tools
- **User Authentication:** Secure login system with roles for regular users and administrators.
- **Admin Panel:** Administrators can manage the user base by adding or deleting users.
- **Intelligent Prompting Tools (Admin):** Automatically generate descriptive text prompts from an uploaded image, extract prompts for just the background or subject, and creatively merge multiple prompt ideas into a new "prompt soup".
- **Responsive & Thematic UI:** A sleek, modern interface that works across devices, with multiple themes (Cyberpunk, Synthwave, etc.) to customize your workspace.

## How to Use

1.  **Login:** Enter your credentials to access the application.
2.  **Select a Tool:** Use the main navigation tabs at the top to choose a tool, such as the Image Generator, Video Generator, Library, Extractor Tools, etc.
3.  **Configure & Provide Inputs:**
    -   **Generators:** In the left-hand panel, upload source media, configure the AI backend (Gemini/ComfyUI), write prompts, and adjust detailed settings.
    -   **Extractor/Utility Tools:** Upload a source file (image or video) and configure the specific tool's options.
4.  **Generate:** Click the "Generate" or other relevant action button to begin processing.
5.  **View & Save Results:** Your generated media will appear in the main content area. You can download items, enhance them, save them to your library, or use an image as a new source for another generation.

## Setup Requirements

-   **Google Gemini API Key:** The application requires a Google Gemini API key. This must be configured as an environment variable named `API_KEY` in the deployment environment. The application includes an in-app guide to help you correctly configure your key's **"HTTP referrer"** restrictions in the Google Cloud Console, which is crucial for it to work.
-   **Google Cloud OAuth Client ID (Optional):** To enable Google Drive library syncing, you must create an OAuth 2.0 Client ID in your Google Cloud project. The application provides a detailed, step-by-step guide to help you configure this, including setting the correct URIs.
-   **ComfyUI Instance (Optional):** To use the ComfyUI features, you must have a running instance of ComfyUI accessible from your browser. You will need to configure the URL to your instance within this application's settings. For certain workflows (e.g., WAN 2.2, Nunchaku), you may need to install specific custom nodes via the ComfyUI Manager.



| Feature Name                            | Uses Gemini | Uses ComfyUI |
|-----------------------------------------|:-----------:|:------------:|
| Image Generation (t2i/i2i)              |     ✅      |      ✅      |
| Batch Image Generation                  |     ✅      |      ✅      |
| Advanced Workflow Selection             |     ❌      |      ✅      |
| Model/LoRA/Checkpoint Loading           |     ❌      |      ✅      |
| Artistic Style/Era Selection            |     ✅      |      ✅      |
| Pose Manipulation                       |     ✅      |      ✅      |
| Clothing/Background Replacement         |     ✅      |      ✅      |
| Face Enhancement/Detailer               |     ✅      |      ✅      |
| Post-Processing (Upscale/Enhance)       |     ✅      |      ❌      |
| Video Generation (t2v/i2v)              |     ✅      |      ✅      |
| Gemini Workflow Helper for ComfyUI      |     ✅      |      ✅      |
| Library Management (Google Drive sync)  |     ✅      |      ❌      |
| Node-based Workflow Editor              |     ❌      |      ✅      |
| Custom Negative Prompt                  |     ✅      |      ✅      |
| Mask/Inpaint/Remove-Replace Task        |     ✅      |      ✅      |

Legend:
- ✅ = Supported by provider
- ❌ = Not supported
