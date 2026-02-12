# BDD Runner Chrome Extension

A powerful Chrome extension for running Gherkin BDD scenarios with built-in HTTP testing and Lua scripting support. Execute API tests, validate responses, and create custom test steps directly in your browser.

## Features

✨ **Gherkin/BDD Syntax** - Write tests in familiar Given/When/Then format  
🌐 **HTTP Testing** - Built-in support for REST API testing (GET, POST, PUT, DELETE, etc.)  
🔧 **Lua Scripting** - Extend functionality with inline Lua code and custom step definitions  
📊 **Real-time Results** - See test execution results with detailed error messages  
💾 **File Management** - Save and organize multiple feature files  
🎨 **Syntax Highlighting** - CodeMirror editor with Gherkin language support  
🔌 **Plugin Architecture** - Extensible plugin system for custom step definitions

## Installation

### From Source

1. Clone the repository:
```bash
git clone https://github.com/cethap/bdd-runner-chrome-extension.git
cd bdd-runner-chrome-extension
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the extension:
```bash
pnpm dev
```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3` directory

## Quick Start

### Basic HTTP Test

```gherkin
Feature: User API Test

  Scenario: Get user by ID
    Given url 'https://jsonplaceholder.typicode.com/users/1'
    When method GET
    Then status 200
    And match response.name == 'Leanne Graham'
    And match response.email contains '@'
```

### POST Request with Body

```gherkin
Feature: Create Post

  Scenario: Create a new post
    Given url 'https://jsonplaceholder.typicode.com/posts'
    And header Content-Type = 'application/json'
    And request {"title": "foo", "body": "bar", "userId": 1}
    When method POST
    Then status 201
    And match response.id == #number
    And def postId = response.id
    And print postId
```

### Using Lua for Advanced Validation

```gherkin
Feature: Lua Validation

  Scenario: Validate users with Lua
    Given url 'https://jsonplaceholder.typicode.com/users'
    When method GET
    Then status 200
    And eval
    """
    local users = json.decode(response.body)
    assert(#users == 10, "Expected 10 users")
    for _, user in ipairs(users) do
      assert(user.email ~= nil, "Missing email for " .. user.name)
    end
    print("Validated " .. #users .. " users")
    """
```

## Built-in Step Definitions

### HTTP Steps

- `Given url '<url>'` - Set the request URL
- `And header <name> = '<value>'` - Add a request header
- `And param <name> = '<value>'` - Add a query parameter
- `And request <json>` - Set request body (inline JSON or doc string)
- `When method <GET|POST|PUT|DELETE|PATCH>` - Execute HTTP request
- `Then status <code>` - Assert response status code

### Assertion Steps

- `And match <expr> == <value>` - Exact match
- `And match <expr> != <value>` - Not equal
- `And match <expr> contains <value>` - Contains check
- `And match <expr> contains { key: #type }` - Schema validation

### Variable Steps

- `And def <varName> = <expression>` - Define a variable
- `And print <expression>` - Print value to results

### Lua Steps

- `And eval` - Execute Lua code (with doc string)
- `And def <varName> = eval` - Capture Lua return value
- `And script '<name>'` - Run a saved Lua script

## Lua Scripting

### Available Lua Globals

- `ctx` - Execution context object
- `response` - Current HTTP response (`{status, headers, body}`)
- `print(...)` - Output to results panel
- `json.encode(obj)` - Convert table to JSON string
- `json.decode(str)` - Parse JSON string to table

### Custom Step Definitions

Create reusable steps with the Lua Script Manager:

1. Click the **Lua** button in toolbar
2. Create a new script named "validators"
3. Add your custom step:

```lua
step("^validate users count (\\d+)$", function(ctx, count)
  local users = json.decode(ctx.response.body)
  local expected = tonumber(count)
  assert(#users == expected, "Expected " .. expected .. " users")
  print("User count validated: " .. #users)
end)
```

4. Save and use in your scenarios:

```gherkin
And validate users count 10
```

## Project Structure

```
gherkin-extension/
├── entrypoints/
│   ├── background.ts          # Service worker
│   └── sidepanel/             # UI components
│       ├── main.ts
│       ├── components/
│       │   ├── Editor.ts      # CodeMirror editor
│       │   ├── FileManager.ts # File sidebar
│       │   ├── ResultsPanel.ts # Test results
│       │   └── ScriptManager.ts # Lua scripts
│       └── styles.css
├── lib/
│   ├── editor/               # CodeMirror config
│   ├── engine/               # Test execution engine
│   │   ├── executor.ts       # Feature runner
│   │   ├── step-matcher.ts   # Pattern matching
│   │   └── step-registry.ts  # Step definitions
│   ├── lua/                  # Lua integration (Fengari)
│   │   ├── lua-bridge.ts     # Lua VM wrapper
│   │   └── lua-stdlib.ts     # Custom Lua stdlib
│   ├── parser/               # Gherkin parser
│   ├── plugins/              # Plugin system
│   ├── steps/                # Built-in steps
│   └── storage/              # Chrome storage
└── wxt.config.ts             # Extension config
```

## Development

### Available Scripts

```bash
# Start development server with hot reload
pnpm dev

# Build for production
pnpm build

# Run type checking
pnpm typecheck
```

### Adding New Step Definitions

1. Create a new step file in `lib/steps/`
2. Export a function returning `StepDefinition[]`
3. Register in `lib/plugins/built-in-plugin.ts`

Example:

```typescript
export function getMyStepDefinitions(): StepDefinition[] {
  return [
    {
      pattern: /^my custom step$/,
      handler: async (ctx, match) => {
        // Your implementation
      },
      description: "My custom step",
    },
  ];
}
```

## Technologies

- **WXT** - Chrome extension framework
- **TypeScript** - Type-safe development
- **CodeMirror 6** - Code editor
- **Fengari** - Lua VM in JavaScript
- **Zustand** - State management
- **Chrome APIs** - Storage, runtime messaging

## Examples

See [samples.md](samples.md) for comprehensive examples including:
- POST/PUT/DELETE requests
- Query parameters
- Chained requests with variable reuse
- Doc string bodies
- Lua eval and variable capture
- Custom Lua steps
- Error handling

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT

## Author

Cesar Tapasco ([@cethap](https://github.com/cethap))
