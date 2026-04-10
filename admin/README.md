# 🧭 AI Widget Dashboard

A comprehensive AI-driven widget dashboard platform that allows users to generate dynamic widgets from natural language queries, manage MCP (Model Context Protocol) connections, and organize widgets in a structured dashboard interface.

## 🚀 Features

### Core Dashboard Features
- **🏠 Dashboard View**: Interactive grid layout with drag-and-drop widget arrangement
- **🔌 MCP Management**: Configure and manage multiple MCP server connections
- **📊 Widget Management**: Organize, categorize, and manage saved widgets
- **⚙️ Settings**: Global preferences and dashboard customization

### Widget Generation & Visualization
- **Natural Language Queries**: Generate widgets by describing what you want to see
- **Multiple Widget Types**: Tables, charts, statistics, and lists with rich interactions
- **Dynamic Data Visualization**: Interactive charts with Recharts, sortable tables with TanStack Table
- **Real-time Data Refresh**: Manual and automatic widget data updates
- **Widget Categorization**: Organize widgets with categories, tags, and descriptions

### MCP Integration
- **Multi-MCP Support**: Connect to multiple MCP servers simultaneously
- **Connection Management**: Test, configure, and monitor MCP connections
- **Capability Discovery**: Auto-discover available data sources and operations
- **Authentication Support**: Secure credential storage for MCP connections

### Advanced Features
- **Responsive Design**: Beautiful UI with Tailwind CSS and shadcn/ui components
- **Search & Filter**: Find widgets and MCPs quickly with advanced search
- **Export/Import**: Share widget configurations and dashboard layouts
- **Template System**: Pre-built widget templates for common use cases

## 🏗️ Architecture

### Dashboard Structure
```
┌─────────────────────────────────────────────────┐
│                   Top Bar                        │
│  [Search] [Notifications] [User Menu]          │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Sidebar  │         Main Content Area           │
│          │                                      │
│ 🏠 Dashboard │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ 🔌 MCPs     │  │ Widget  │ │ Widget  │ │ Widget  │ │
│ 📊 Widgets  │  │   1     │ │   2     │ │   3     │ │
│ ⚙️ Settings │  └─────────┘ └─────────┘ └─────────┘ │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### Core Components

1. **Dashboard Layout System**
   - Responsive sidebar navigation
   - Contextual top bar with search and actions
   - Grid-based widget layout with drag-and-drop
   - Breadcrumb navigation for deep sections

2. **MCP Management System** (`src/lib/mcpClient.ts`)
   - Connection configuration and testing
   - Capability discovery and validation
   - Health monitoring and status tracking
   - Secure authentication handling

3. **Widget Management System**
   - CRUD operations for widgets
   - Categorization and tagging system
   - Template library and custom widgets
   - Search and filtering capabilities

4. **Enhanced Widget Types**
   - **TableWidget**: Sortable, filterable tables with pagination
   - **ChartWidget**: Line, bar, pie, and area charts with interactions
   - **StatWidget**: KPI displays with trend indicators and formatting
   - **ListWidget**: Bullet, numbered, or card-style lists with customization

## 🛠️ Technology Stack

- **Framework**: Next.js 15 with App Router
- **UI Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Data Visualization**: Recharts for charts, TanStack Table for tables
- **Icons**: Lucide React
- **State Management**: React hooks and local state
- **API Layer**: Next.js API routes with RESTful design
- **Development**: TypeScript, ESLint, Hot reload

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern web browser with JavaScript enabled

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd querypanel-web
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

### First Steps
1. **Explore the Dashboard** - Start with the main dashboard view
2. **Configure MCPs** - Go to MCP Management to set up data sources
3. **Generate Widgets** - Use natural language to create your first widgets
4. **Organize Widgets** - Use Widget Management to categorize and organize

## 📝 Usage Guide

### Generating Widgets
Navigate to the Dashboard and try these natural language queries:

- **"Show me GitHub issues"** → Generates a table widget with GitHub issues
- **"Display Jira bugs assigned to me"** → Creates a stat widget showing bug count
- **"Chart of weekly commits"** → Produces a line chart of commit activity
- **"List of recent tasks"** → Shows a list widget with pending tasks
- **"GitHub issues and Jira bugs"** → Generates multiple widgets

### Managing MCPs
1. Go to **🔌 MCP Management** in the sidebar
2. Click **"Add MCP Connection"**
3. Configure connection details (endpoint, authentication)
4. Test the connection to verify it works
5. The MCP becomes available for widget generation

### Organizing Widgets
1. Go to **📊 Widget Management** in the sidebar
2. Browse your saved widgets by category
3. Use search to find specific widgets
4. Edit, duplicate, or delete widgets as needed
5. Create categories and tags for better organization

## 🎯 Widget Types & Capabilities

### Table Widget
- **Features**: Sortable columns, global search, filtering, pagination
- **Data Types**: Any tabular data from MCPs
- **Customization**: Column selection, date formatting, page sizes
- **Use Cases**: Issue lists, user data, transaction records

### Chart Widget
- **Chart Types**: Line, bar, pie, area charts
- **Features**: Interactive tooltips, legends, responsive design
- **Data Types**: Time series, categorical, numerical data
- **Use Cases**: Trends, comparisons, distributions, KPIs

### Stat Widget
- **Features**: Large number display, trend indicators, formatting
- **Formats**: Numbers, currency, percentages with prefixes/suffixes
- **Trends**: Up/down arrows with change values
- **Use Cases**: KPIs, metrics, counts, summary statistics

### List Widget
- **Styles**: Bullet points, numbered lists, card layouts
- **Features**: Item limiting, overflow indicators, subtitle support
- **Data Types**: Simple lists, object arrays, mixed content
- **Use Cases**: Todo lists, notifications, recent activity

## 🔧 API Reference

### Widget APIs
```typescript
// Generate widgets from natural language
POST /api/generate-widgets
{
  "prompt": "Show me GitHub issues and Jira bugs"
}

// CRUD operations for widgets
GET    /api/widgets
POST   /api/widgets
PUT    /api/widgets/[id]
DELETE /api/widgets/[id]

// Widget categorization
GET /api/widgets/categories
POST /api/widgets/categories
```

### MCP APIs
```typescript
// MCP connection management
GET    /api/mcps
POST   /api/mcps
PUT    /api/mcps/[id]
DELETE /api/mcps/[id]

// Test MCP connection
POST /api/mcps/test
{
  "endpoint": "http://localhost:8080",
  "auth": { ... }
}

// Get MCP capabilities
GET /api/mcps/[id]/capabilities
```

### Dashboard APIs
```typescript
// Dashboard layout management
GET /api/dashboard/layout
POST /api/dashboard/layout

// Export/import dashboard
GET /api/dashboard/export
POST /api/dashboard/import
```

## 📁 Project Structure

```
src/
├── app/
│   ├── dashboard/           # Dashboard routes
│   │   ├── page.tsx        # Main dashboard
│   │   ├── mcps/           # MCP management pages
│   │   ├── widgets/        # Widget management pages
│   │   └── settings/       # Settings pages
│   ├── api/                # API routes
│   │   ├── widgets/        # Widget CRUD operations
│   │   ├── mcps/           # MCP management
│   │   └── dashboard/      # Dashboard operations
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── components/
│   ├── layout/             # Layout components
│   │   ├── Sidebar.tsx     # Navigation sidebar
│   │   ├── TopBar.tsx      # Header bar
│   │   └── DashboardLayout.tsx
│   ├── views/              # Page views
│   │   ├── DashboardView.tsx
│   │   ├── MCPManagementView.tsx
│   │   └── WidgetManagementView.tsx
│   ├── mcps/               # MCP components
│   │   ├── MCPConnectionCard.tsx
│   │   └── MCPConfigModal.tsx
│   ├── widgets/            # Widget components
│   │   ├── WidgetRenderer.tsx
│   │   ├── WidgetLibrary.tsx
│   │   └── widgets/
│   │       ├── TableWidget.tsx
│   │       ├── ChartWidget.tsx
│   │       ├── StatWidget.tsx
│   │       └── ListWidget.tsx
│   └── ui/                 # Base UI components
├── lib/
│   ├── mcpClient.ts        # MCP client wrapper
│   ├── openaiClient.ts     # AI client for widget generation
│   ├── mcpRegistry.ts      # MCP discovery and management
│   └── utils.ts            # Utility functions
└── types/
    ├── Widget.ts           # Widget type definitions
    ├── MCP.ts              # MCP type definitions
    └── Dashboard.ts        # Dashboard type definitions
```

## 🎨 Design System

### Navigation
- **Sidebar**: Collapsible navigation with section icons
- **Breadcrumbs**: Context-aware navigation trail
- **Search**: Global search across widgets and MCPs

### Layout
- **Grid System**: Responsive widget grid with drag-and-drop
- **Card Design**: Consistent card-based UI for widgets and components
- **Modal System**: Overlay dialogs for configuration and editing

### Colors & Themes
- **CSS Variables**: Customizable color system
- **Dark/Light Mode**: Automatic theme switching
- **Brand Colors**: Consistent color palette throughout

## 🔮 Roadmap

### Phase 1: Core Platform ✅
- [x] Basic widget generation and display
- [x] Mock MCP implementation
- [x] Dashboard layout and navigation
- [x] Widget management interface

### Phase 2: Enhanced Management (In Progress)
- [ ] Real MCP server integration
- [ ] Advanced widget editor
- [ ] Dashboard layout persistence
- [ ] Widget templates and marketplace

### Phase 3: Advanced Features
- [ ] Multi-workspace support
- [ ] Real-time collaboration
- [ ] Advanced analytics and monitoring
- [ ] Custom widget development SDK

### Phase 4: Enterprise Features
- [ ] Role-based access control
- [ ] SSO integration
- [ ] Audit logging and compliance
- [ ] High availability and scaling

## 🔐 Security Considerations

### Data Security
- **Credential Encryption**: MCP credentials stored securely
- **Data Transmission**: HTTPS for all communications
- **Access Control**: Role-based permissions for widgets and MCPs
- **Audit Logging**: Track user actions and data access

### MCP Security
- **Connection Validation**: Verify MCP endpoints before connecting
- **Rate Limiting**: Prevent abuse of MCP connections
- **Sandbox Execution**: Isolated widget execution environment
- **Error Handling**: Secure error messages without data exposure

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the coding standards
4. Add tests for new functionality
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Coding Standards
- **TypeScript**: Strict typing for all components
- **ESLint**: Follow the configured linting rules
- **Component Structure**: Consistent component organization
- **Testing**: Unit tests for utilities and integration tests for APIs

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Next.js, TypeScript, and modern web technologies.**

For support and questions, please open an issue or contact the development team.
