# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Development**: `npm run dev` - Starts Next.js development server
- **Build**: `npm run build` - Runs Convex deployment, codegen, and Next.js build
- **Testing**: `npm test` - Runs Vitest tests
- **Testing UI**: `npm run test:ui` - Runs Vitest with UI
- **Lint**: `npm run lint` - Runs Next.js ESLint
- **Start**: `npm start` - Starts production server

### Convex Development
- `npx convex dev` - Start Convex development environment
- `npx convex deploy` - Deploy Convex backend
- `npx convex codegen` - Generate TypeScript definitions

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui with Radix UI primitives
- **Backend**: Convex (real-time database and API)
- **External API**: AeroDataBox for flight data
- **LLM Integration**: Groq API with Llama models for e-ticket parsing
- **PDF Generation**: @react-pdf/renderer
- **Validation**: Zod schemas with strict LLM response validation
- **Forms**: react-hook-form with zodResolver
- **Testing**: Vitest with @testing-library/react

### Directory Structure
- `/app` - Next.js App Router pages and API routes
- `/components` - React components (including shadcn/ui components in `/ui`)
- `/convex` - Convex backend functions and schema
- `/lib` - Utilities, actions, providers, and validations
  - `/lib/llm` - LLM integration modules (client, schemas, extraction, token tracking)
  - `/lib/parsers` - E-ticket parsers (BA-specific, generic with LLM fallback)
  - `/lib/server` - Server-side utilities (PDF/email text extraction)

### Key Architecture Components

#### Database Schema (Convex)
- **Itineraries**: Store passenger details and flight segments with comprehensive flight data including airports, times, terminals, gates, aircraft info, and codeshares
- **LLM Usage Tracking**: Record token usage and costs for all LLM API calls (`llmUsage` table)
- **LLM Statistics**: Rolling average statistics for cost monitoring (`llmStats` table)

#### Data Flow
1. User submits flight search form (`components/flight-search-form.tsx`)
2. Server action processes form data (`lib/actions.ts`)
3. Flight data fetched from AeroDataBox API (`lib/providers/aerodatabox.ts`)
4. Data validated with Zod schemas (`lib/validations.ts`)
5. Itinerary stored in Convex database
6. User redirected to confirmation page with PDF generation capability

#### Flight Data Integration
- Real-time flight data from AeroDataBox API
- Timezone-aware departure/arrival times using date-fns-tz
- Support for codeshare flights
- Aircraft, terminal, and gate information when available
- IATA flight number validation and normalization

#### PDF Generation
- Custom branded PDF template (`components/pdf-template.tsx`)
- Server-side rendering via API route (`app/api/itineraries/[id]/pdf/route.ts`)
- Comprehensive flight details and passenger information

#### E-ticket Ingestion
- **File Upload Interface**: Drag-and-drop support for PDF e-tickets and email files (`app/ingest/page.tsx`)
- **Text Extraction**: Server-side processing of PDF and EML files (`lib/server/extractText.ts`)
- **Intelligent Parsing**: Pluggable parser architecture with AI-first approach
- **LLM Integration**: Groq-powered extraction with model routing (8B → 70B retry logic)
- **Validation & Review**: Strict Zod validation with user review interface before saving
- **Cost Tracking**: Comprehensive token usage monitoring and cost visibility

#### Parser Architecture
- **AI-First Mode** (Default): Uses LLM extraction as primary method, with carrier-specific enrichment
  - Higher accuracy for passenger names and complex data
  - Carrier-specific hints improve extraction quality
  - Regex patterns used only for enrichment (terminals, gates, etc.)
- **Regex-First Mode** (Legacy): Traditional carrier-specific regex parsing with LLM fallback
  - Maintained for backward compatibility
  - Falls back to AI when extraction quality is poor
- **Configurable via `PARSER_MODE`**: Switch between `ai_first` and `regex_first` modes
- **Carrier-Specific Enrichment**: BA parser enriches AI results with airline-specific metadata

#### LLM Model Router
- **Primary Model**: `llama-3.1-8b-instant` for initial extraction (cost-effective)
- **Fallback Model**: `llama-3.1-70b-versatile` for complex cases missing critical fields
- **Smart Retry Logic**: Automatically retries with more powerful model if booking reference, passengers, or flight segments are missing
- **Token Tracking**: Records all API calls with rolling averages for cost monitoring

### Environment Variables Required
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL
- `AERODATABOX_API_KEY` - AeroDataBox API key for flight data
- `GROQ_API_KEY` - Groq API key for LLM-powered e-ticket extraction
- `LLM_PROVIDER=groq` - Enable Groq LLM integration
- `LLM_MODEL_CHEAP=llama-3.1-8b-instant` - Primary extraction model
- `LLM_MODEL_BURST=llama-3.1-70b-versatile` - Fallback model for complex extractions
- `PARSER_MODE=ai_first` - Parser preference mode: `ai_first` (default) or `regex_first`

### Form Validation
All forms use Zod schemas for validation with react-hook-form integration. Passenger types supported: adult, child, infant.

### Mobile-First Design
Application is built with mobile-first responsive design using Tailwind CSS. Components are optimized for touch interaction and small screens.

### Testing Strategy
Tests focus on flight data normalization, timezone handling, API integration, and component behavior. Run tests before making significant changes to ensure data integrity.