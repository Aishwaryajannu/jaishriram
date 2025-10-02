# Use official Playwright image with Chromium preinstalled
FROM mcr.microsoft.com/playwright:v1.55.1-focal

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of your app code
COPY . .

# Expose the port Render expects (default 10000)
EXPOSE 10000

# Start the app
CMD ["node", "linkedin-service.js"]
