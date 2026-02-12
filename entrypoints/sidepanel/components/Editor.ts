import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  StreamLanguage,
} from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { gherkinLanguage } from "@/lib/editor/gherkin-language";
import { gherkinCompletion } from "@/lib/editor/gherkin-completion";
import { gherkinTheme, gherkinHighlighting } from "@/lib/editor/gherkin-theme";

const DEFAULT_FEATURE = `Feature: Sample API Test
  Test the JSONPlaceholder API

  Scenario: Get a user by ID
    Given url 'https://jsonplaceholder.typicode.com/users/1'
    When method GET
    Then status 200
    And match response.name == 'Leanne Graham'
    And match response contains { id: #number }
    And def userId = response.id
    And print userId
`;

export class Editor {
  private view: EditorView;
  private onChangeCallbacks: Array<(content: string) => void> = [];

  constructor(container: HTMLElement, initialContent?: string) {
    const state = EditorState.create({
      doc: initialContent ?? DEFAULT_FEATURE,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        gherkinLanguage,
        gherkinTheme,
        gherkinHighlighting,
        autocompletion({
          override: [gherkinCompletion],
          activateOnTyping: true,
        }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            for (const cb of this.onChangeCallbacks) {
              cb(content);
            }
          }
        }),
      ],
    });

    this.view = new EditorView({ state, parent: container });
  }

  getContent(): string {
    return this.view.state.doc.toString();
  }

  setContent(content: string): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: content,
      },
    });
  }

  onChange(callback: (content: string) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
