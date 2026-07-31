```markdown
# breathing-webapp Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `breathing-webapp` repository, a Java-based web application scaffolded with the Vite framework. You'll learn how to structure files, write imports/exports, follow commit message practices, and understand the project's approach to testing.

## Coding Conventions

### File Naming
- Use **snake_case** for all file names.
  - Example: `breathing_component.java`, `user_profile.java`

### Import Style
- Mixed import styles are used (both single and grouped).
  - Example:
    ```java
    import java.util.List;
    import java.io.*;
    ```

### Export Style
- Use **default exports** for modules.
  - Example:
    ```java
    public class BreathingComponent {
        // class implementation
    }
    ```

### Commit Messages
- Freeform style, no strict prefixes.
- Average commit message length: ~43 characters.
  - Example:  
    ```
    Add initial breathing exercise component
    ```

## Workflows

### Creating a New Component
**Trigger:** When adding a new UI or logic component  
**Command:** `/create-component`

1. Create a new Java file using snake_case (e.g., `new_feature_component.java`).
2. Implement the component logic.
3. Use mixed import styles as needed.
4. Export the component as default (public class).
5. Add a corresponding test file (see Testing Patterns).
6. Commit your changes with a concise, descriptive message.

### Running the Application
**Trigger:** To start the development server  
**Command:** `/run-app`

1. Ensure all dependencies are installed.
2. Use Vite's development server command (e.g., `vite` or `npm run dev`).
3. Access the application via the provided local URL.

### Writing and Running Tests
**Trigger:** When adding or updating features  
**Command:** `/run-tests`

1. Create a test file matching the pattern `*.test.*` (e.g., `breathing_component.test.java`).
2. Write tests for your component or logic.
3. Use the project's test runner (framework unknown; check project scripts).
4. Run tests and ensure all pass before committing.

## Testing Patterns

- Test files follow the pattern: `*.test.*`
  - Example: `breathing_component.test.java`
- Testing framework is not explicitly defined; check the repository for test runner details.
- Place test files alongside the components they test or in a dedicated test directory.

## Commands

| Command            | Purpose                                      |
|--------------------|----------------------------------------------|
| /create-component  | Scaffold a new component with conventions    |
| /run-app           | Start the development server                 |
| /run-tests         | Run all test files in the project            |
```
