# Haske Itinerary

A modern flight itinerary management system built with Next.js 14, Convex, and TypeScript.

## Features

- 🛫 Flight search with IATA flight number validation
- 👥 Multi-passenger support (Adult/Child/Infant)
- 📊 Real-time flight data from AeroDataBox API
- 🗃️ Persistent storage with Convex database
- 📱 Mobile-first responsive design
- 🎨 Modern UI with shadcn/ui components
- 📄 PDF itinerary generation
- 🕒 Timezone-aware flight times
- ✈️ Codeshare flight support
- ⚡ Server-side validation and error handling

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Convex
- **Styling**: Tailwind CSS + shadcn/ui
- **Validation**: Zod
- **PDF Generation**: @react-pdf/renderer
- **Timezone Handling**: date-fns-tz
- **Testing**: Vitest

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Convex Configuration
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-url.convex.cloud

# AeroDataBox API Configuration  
AERODATABOX_API_KEY=your-aerodatabox-api-key
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Convex Setup

```bash
# Login to Convex
npx convex login

# Initialize and deploy
npx convex dev
```

### 4. Development

```bash
# Start the development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## API Integration

### AeroDataBox Configuration

1. Sign up at [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox/)
2. Subscribe to a plan (free tier available)
3. Copy your API key to `.env.local`

### Supported Flight Number Formats

- `AA123` - American Airlines flight 123
- `BA 456` - British Airways flight 456
- `LH0001` - Lufthansa flight 1 with leading zero
- `EK007A` - Emirates flight 7A with suffix

## Usage

1. **Create Itinerary**: Enter passenger details and flight numbers
2. **Search Flights**: System fetches real-time data from AeroDataBox
3. **Review Segments**: View comprehensive flight details
4. **Download PDF**: Generate branded PDF itinerary

## Features in Detail

### Flight Data Normalization
- Automatic timezone conversion for departure/arrival times
- Codeshare flight detection and display
- Aircraft information when available
- Terminal and gate details
- Actual vs scheduled time handling

### PDF Generation
- Professional branded layout
- Complete passenger and flight information
- QR codes for easy mobile access
- Print-optimized formatting

### Mobile Experience
- Touch-friendly form controls
- Responsive table layouts
- Optimized loading states
- Progressive enhancement

## Testing

The project includes comprehensive unit tests for:
- Flight data normalization
- Timezone handling
- Codeshare flight processing
- Error scenarios
- Edge cases (+1 day arrivals)

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

## Security

- Environment variable validation at startup
- Input sanitization with Zod schemas
- Server-side API key protection
- CSRF protection with Next.js server actions

## Deployment

### Vercel (Recommended)

1. Push to GitHub repository
2. Import project to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy Convex backend: `npx convex deploy`

### Self-Hosted

1. Build the project: `npm run build`
2. Deploy to your preferred hosting platform
3. Ensure environment variables are configured
4. Deploy Convex backend separately

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review the test files for usage examples

---

**Disclaimer**: This itinerary is informational and not a travel document. Always verify flight details with your airline before traveling.