FROM mcr.microsoft.com/playwright:v1.55.1-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci --only=production

# Install Playwright browsers explicitly
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copy application code
COPY . .

# Create screenshots directory
RUN mkdir -p /app/screenshots

EXPOSE 3000
ENV PORT=3000

CMD ["node", "linkedin-service.js"]