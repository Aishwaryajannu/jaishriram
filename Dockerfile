# Use official Playwright image with Chromium preinstalled
FROM mcr.microsoft.com/playwright:focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port
ENV PORT=10000
EXPOSE 10000

# Run the service
CMD ["node", "linkedin-service.js"]
