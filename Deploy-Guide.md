# Surface Cloud Browser - Deployment Guide

A complete step-by-step guide to deploy your **Surface Cloud Browser** to the cloud for free, so your Microsoft Surface 2 can browse the modern web (`netmirror.gg`, YouTube, Google, etc.) completely standalone with **0% dependency on your laptop**.

---

## Method 1: Hugging Face Spaces (Recommended ⭐)

> [!TIP]
> **Why Hugging Face Spaces is the Best Choice:**
> - **16 GB RAM & 2 vCPUs** completely free forever (Chromium needs ~400MB RAM, so 16GB runs super fast with zero lag).
> - Free HTTPS SSL certificate included automatically.
> - Direct Git push deployment in 2 minutes.

### Step-by-Step Instructions:

1. **Create Free Account:**
   - Go to [https://huggingface.co/join](https://huggingface.co/join) and create a free account (if you don't already have one).

2. **Create New Space:**
   - Click your profile icon at top right -> **New Space** (or go to [https://huggingface.co/new-space](https://huggingface.co/new-space)).
   - **Space name**: Enter any name you like, for example: `surface-browser`.
   - **License**: Choose `MIT` or `OpenRAIL`.
   - **Select the Space SDK**: Choose **Docker** -> **Blank**.
   - **Space hardware**: Free (2 vCPU, 16 GB RAM).
   - Click **Create Space**.

3. **Deploy from your Laptop (3 Commands):**
   - Open PowerShell on your laptop, navigate to the project directory:
     ```powershell
     cd "c:\Users\Mubeen\Desktop\New folder\surface-cloud-browser"
     git init
     git add .
     git commit -m "Deploy Cloud Browser for Surface 2"
     git remote add origin https://huggingface.co/spaces/<YOUR_HF_USERNAME>/surface-browser
     git push -u origin main --force
     ```
   *(Note: Jab password/token maange, Hugging Face Settings -> Access Tokens se free token generate karke daal dein).*

4. **Done!**
   - 2 minute mein build complete ho jayega aur status **"Running"** show karega.
   - Aapka personal URL tayyar hoga:
     👉 `https://<YOUR_USERNAME>-surface-browser.hf.space`
   - Ab Surface 2 uthayein, IE11 kholein, aur yeh URL daal dein. Modern web chalu!

---

## Method 2: Render.com (Alternative)

> [!NOTE]
> Render provides a free Docker web service tier (512 MB RAM).

### Step-by-Step Instructions:

1. **Push to GitHub:**
   - Go to [https://github.com/new](https://github.com/new) and create a repository (e.g. `surface-cloud-browser`).
   - Run in PowerShell:
     ```powershell
     cd "c:\Users\Mubeen\Desktop\New folder\surface-cloud-browser"
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/surface-cloud-browser.git
     git push -u origin main
     ```

2. **Deploy on Render:**
   - Go to [https://dashboard.render.com](https://dashboard.render.com).
   - Click **New +** -> **Web Service**.
   - Connect your GitHub repository `surface-cloud-browser`.
   - Render will automatically detect the `Dockerfile` and `render.yaml`.
   - Select the **Free** instance type.
   - Click **Create Web Service**.

3. **Open on Surface 2:**
   - Render will generate your live URL (e.g., `https://surface-cloud-browser.onrender.com`).
   - Type this URL into the Surface 2 Internet Explorer.

---

## Surface 2 Features Supported

- **Full Touch Support**: Tap anywhere on the Surface screen to click links, buttons, and video players.
- **Touch Scrolling**: Swipe up or down to scroll pages smoothly.
- **Built-in Keyboard Helper**: Tap the **⌨** icon on the toolbar to pop up a virtual text sender if needed.
- **Modern JavaScript**: All modern frameworks (React, Vue, ES6+) run inside the cloud Chromium engine—your Surface 2 will never crash from JavaScript syntax errors.
- **Quality Settings**: Choose between Eco (Fastest on slow Wi-Fi) and High Res for crisp text and video.
