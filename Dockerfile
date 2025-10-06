# Use Playwright image matching your package.json version
FROM mcr.microsoft.com/playwright:v1.55.1-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Set environment variable for PORT
ENV PORT=3000

# Start the application
CMD ["node", "linkedin-service.js"]