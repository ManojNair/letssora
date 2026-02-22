# LetsSora Architecture Documentation

## System Overview

LetsSora is a full-stack web application that enables users to generate AI-powered videos and images using Azure's cloud services.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph UserInterface["🖥️ User Interface"]
        Browser[Web Browser]
    end

    subgraph Frontend["⚛️ Frontend - React + Vite :3000"]
        direction TB
        App[App.jsx<br/>Main Component]
        ModeSelector[Mode Selector<br/>Video/Image Toggle]
        PromptInput[Prompt Input<br/>Text Area]
        SettingsPanel[Settings Panel<br/>Size, Duration]
        ResultDisplay[Result Display<br/>Video/Image Viewer]
        DownloadBtn[Download Button]
    end

    subgraph Backend["🚀 Backend - Express :3001"]
        direction TB
        HealthAPI[GET /api/health]
        VideoGenAPI[POST /api/generate-video]
        ImageGenAPI[POST /api/generate-image]
        VideoStatusAPI[GET /api/video-status/:id]
        VideoContentAPI[GET /api/video-content/:id]
        HistoryAPI[GET/DELETE /api/generations]
        SaveGenAPI[POST /api/save-generation]
        AuthModule[Auth Module<br/>DefaultAzureCredential]
        DbModule[db.js<br/>Cosmos DB Client]
        StorageModule[storage.js<br/>Blob Storage Client]
    end

    subgraph AzureServices["☁️ Azure Services"]
        direction TB
        EntraID[Azure Entra ID<br/>Authentication]
        
        subgraph OpenAI["Azure OpenAI Service"]
            SoraModel[Sora 2 Model<br/>Video Generation]
        end
        
        subgraph AIFoundry["Azure AI Foundry"]
            FluxModel[Flux 2 Pro Model<br/>Image Generation]
        end

        CosmosDB[Azure Cosmos DB<br/>NoSQL - Serverless]
        BlobStorage[Azure Blob Storage<br/>Media Files]
    end

    Browser --> App
    App --> ModeSelector
    App --> PromptInput
    App --> SettingsPanel
    App --> ResultDisplay
    ResultDisplay --> DownloadBtn

    App -->|Proxy /api/*| Backend
    
    VideoGenAPI --> AuthModule
    ImageGenAPI --> AuthModule
    VideoStatusAPI --> AuthModule
    VideoContentAPI --> AuthModule
    
    AuthModule -->|Get Token| EntraID
    
    VideoGenAPI -->|Async Job| SoraModel
    VideoStatusAPI -->|Poll Status| SoraModel
    VideoContentAPI -->|Get Content| SoraModel
    
    ImageGenAPI -->|Sync Request| FluxModel
    
    HistoryAPI --> DbModule
    SaveGenAPI --> DbModule
    SaveGenAPI --> StorageModule
    DbModule --> CosmosDB
    StorageModule --> BlobStorage
    
    EntraID -.->|Bearer Token| SoraModel
    EntraID -.->|Bearer Token| FluxModel
    EntraID -.->|Bearer Token| CosmosDB
    EntraID -.->|Bearer Token| BlobStorage
```

## Data Flow

### Video Generation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant A as Azure Entra ID
    participant S as Sora 2 API

    U->>F: Enter prompt & settings
    U->>F: Click Generate
    F->>B: POST /api/generate-video
    B->>A: Get access token
    A-->>B: Bearer token
    B->>S: POST /openai/v1/videos
    S-->>B: Job ID
    B-->>F: { jobId }
    
    loop Poll Status
        F->>B: GET /api/video-status/:id
        B->>A: Get access token
        A-->>B: Bearer token
        B->>S: GET /openai/v1/videos/:id
        S-->>B: Status (pending/running/completed)
        B-->>F: Status update
    end
    
    F->>B: GET /api/video-content/:id
    B->>S: GET /openai/v1/videos/:id/content
    S-->>B: Video binary
    B-->>F: Video data (base64)
    F->>U: Display video
```

### Image Generation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant A as Azure Entra ID
    participant FL as Flux 2 Pro API

    U->>F: Enter prompt & settings
    U->>F: Click Generate
    F->>B: POST /api/generate-image
    B->>A: Get access token
    A-->>B: Bearer token
    B->>FL: POST /providers/blackforestlabs/v1/flux-2-pro
    Note over FL: Image generation<br/>(may take 30-120s)
    FL-->>B: { data: [{ b64_json }] }
    B-->>F: Image data (base64)
    F->>U: Display image
```

## Component Architecture

```mermaid
graph TB
    subgraph App["App.jsx"]
        direction TB
        
        subgraph State["State Management"]
            prompt[prompt]
            mode[generationMode]
            settings[videoSettings/imageSettings]
            result[generatedContent]
            loading[isGenerating]
        end
        
        subgraph Handlers["Event Handlers"]
            handleGenerate[handleGenerate]
            handleVideoGen[handleVideoGeneration]
            handleImageGen[handleImageGeneration]
            pollStatus[pollVideoStatus]
            handleDownload[handleDownload]
        end
        
        subgraph UI["UI Components"]
            Header[Header + Title]
            HistorySidebar[History Sidebar]
            ModeToggle[Mode Toggle]
            PromptArea[Prompt Text Area<br/>+ Image Paste]
            SettingsSection[Settings Section]
            GenerateBtn[Generate Button]
            ResultViewer[Result Viewer]
        end
    end
    
    State --> Handlers
    Handlers --> UI
    UI --> State
```

## Technology Decisions

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend Framework | React 18 | Industry standard, large ecosystem |
| Build Tool | Vite | Fast HMR, modern ES modules |
| Styling | Tailwind CSS | Rapid prototyping, consistent design |
| Animations | Framer Motion | Smooth, declarative animations |
| Backend | Express.js | Simple, flexible, well-documented |
| Database | Azure Cosmos DB (NoSQL, Serverless) | Low-latency, auto-scale, serverless billing |
| Media Storage | Azure Blob Storage | Scalable, cost-effective for images/videos |
| Authentication | @azure/identity | Official SDK, supports multiple auth methods |
| HTTP Client | Fetch API | Native, no dependencies needed |

## Security Model

```mermaid
graph LR
    subgraph Client["Client Side"]
        Browser[Browser]
    end
    
    subgraph Server["Server Side"]
        Express[Express Server]
        Credential[DefaultAzureCredential]
    end
    
    subgraph Azure["Azure"]
        EntraID[Entra ID]
        Services[Azure Services]
    end
    
    Browser -->|No secrets exposed| Express
    Express --> Credential
    Credential -->|az login / env vars / managed identity| EntraID
    EntraID -->|Short-lived tokens| Services
    
    style Browser fill:#e1f5fe
    style Express fill:#fff3e0
    style Credential fill:#e8f5e9
    style EntraID fill:#fce4ec
    style Services fill:#f3e5f5
```

## Environment Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | `https://xxx.openai.azure.com` |
| `SORA_MODEL_DEPLOYMENT` | Sora 2 deployment name | `sora-2` |
| `AZURE_FOUNDRY_ENDPOINT` | Azure AI Foundry endpoint | `https://xxx.services.ai.azure.com` |
| `FLUX_MODEL_DEPLOYMENT` | Flux deployment name | `FLUX.2-pro` |
| `PORT` | Backend server port | `3001` |
| `COSMOS_DB_ENDPOINT` | Cosmos DB account endpoint | `https://cosmos-letssora-dev.documents.azure.com:443/` |
| `COSMOS_DB_DATABASE` | Cosmos DB database name | `letssora` |
| `AZURE_STORAGE_ACCOUNT_NAME` | Blob Storage account name | `stletssoradev` |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container name | `media` |
