

export default defineContentScript({
    matches: ["<all_urls>"],
    main() {
        let isRecording = false;

        // Listen for messages from background
        chrome.runtime.onMessage.addListener((message) => {
            console.log("[Gherkin Recorder] Received message:", message);
            if (message.type === "record:start") {
                startRecording();
            } else if (message.type === "record:stop") {
                stopRecording();
            }
        });

        let overlay: HTMLDivElement | null = null;
        let highlightedElement: HTMLElement | null = null;

        function startRecording() {
            if (isRecording) return;
            isRecording = true;
            console.log("[Gherkin Recorder] Started");

            // Add Overlay
            overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.bottom = '20px';
            overlay.style.right = '20px';
            overlay.style.zIndex = '999999';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            overlay.style.color = 'white';
            overlay.style.padding = '10px 20px';
            overlay.style.borderRadius = '30px';
            overlay.style.fontFamily = 'Arial, sans-serif';
            overlay.style.fontSize = '14px';
            overlay.style.fontWeight = 'bold';
            overlay.style.pointerEvents = 'none';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.gap = '10px';
            overlay.innerHTML = `
                <div style="width: 10px; height: 10px; background-color: red; border-radius: 50%; box-shadow: 0 0 5px red; animation: blink 1s infinite;"></div>
                Recording...
            `;

            // Add blink animation style
            const style = document.createElement('style');
            style.id = 'gherkin-recording-style';
            style.textContent = `
                @keyframes blink {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);

            // Add Listeners
            document.addEventListener("click", handleClick, true);
            document.addEventListener("input", handleInput, true);
            document.addEventListener("change", handleChange, true);
            document.addEventListener("mouseover", handleMouseOver, true);
            document.addEventListener("mouseout", handleMouseOut, true);
        }

        function stopRecording() {
            if (!isRecording) return;
            isRecording = false;
            console.log("[Gherkin Recorder] Stopped");

            // Remove Overlay
            if (overlay) {
                overlay.remove();
                overlay = null;
            }
            const style = document.getElementById('gherkin-recording-style');
            if (style) style.remove();

            // Remove Highlight
            if (highlightedElement) {
                highlightedElement.style.outline = '';
                highlightedElement = null;
            }

            // Remove Listeners
            document.removeEventListener("click", handleClick, true);
            document.removeEventListener("input", handleInput, true);
            document.removeEventListener("change", handleChange, true);
            document.removeEventListener("mouseover", handleMouseOver, true);
            document.removeEventListener("mouseout", handleMouseOut, true);
        }

        function handleMouseOver(event: MouseEvent) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;
            highlightedElement = target;
            target.style.outline = '2px solid red';
        }

        function handleMouseOut(event: MouseEvent) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;
            target.style.outline = '';
            if (highlightedElement === target) {
                highlightedElement = null;
            }
        }

        function handleClick(event: MouseEvent) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;
            const selector = getSelector(target);
            const step = `When I click "${selector}"`;
            sendStep(step);
        }

        function handleInput(event: Event) {
            if (!isRecording) return;
            const target = event.target as HTMLInputElement;
            // Only process if it's actually an input field
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

            const selector = getSelector(target);
            const value = target.value;

            // Send immediately for now, debouncing can be handled later or in background if needed
            // But actually sending on every keystroke is bad. Let's just listen for 'change' or blur?
            // 'input' fires on every keystroke. 'change' fires on commit.
            // Let's stick to 'change' for inputs to avoid spam, but 'input' might be needed for real-time feedback.
            // For a simple recorder, 'change' is safer.
        }

        function handleChange(event: Event) {
            if (!isRecording) return;
            const target = event.target as HTMLElement;

            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                const selector = getSelector(target);
                const value = (target as HTMLInputElement).value;
                sendStep(`When I fill "${selector}" with "${value}"`);
            } else if (target.tagName === 'SELECT') {
                const selector = getSelector(target);
                const value = (target as HTMLSelectElement).value;
                sendStep(`When I select "${value}" from "${selector}"`);
            }
        }

        function sendStep(step: string) {
            console.log("[Gherkin Recorder] Sending step:", step);
            chrome.runtime.sendMessage({ type: "record:step", step });
        }

        function getSelector(el: HTMLElement): string {
            // 1. ID
            if (el.id) {
                return `#${el.id}`;
            }

            // 2. Button Text (simplified)
            if (el.tagName === 'BUTTON' && el.innerText.trim()) {
                return `button "${el.innerText.trim()}"`;
            }

            // 3. Placeholder
            if ((el as HTMLInputElement).placeholder) {
                return `[placeholder="${(el as HTMLInputElement).placeholder}"]`;
            }

            // 4. Name
            if ((el as any).name) {
                return `[name="${(el as any).name}"]`;
            }

            // 5. CSS Path fallback
            return getCssPath(el);
        }

        function getCssPath(el: HTMLElement): string {
            if (!(el instanceof Element)) return '';
            const path: string[] = [];
            let curr: Element | null = el;

            while (curr && curr.nodeType === Node.ELEMENT_NODE && curr.tagName.toLowerCase() !== 'html') {
                let selector = curr.tagName.toLowerCase();
                if (curr.id) {
                    selector += `#${curr.id}`;
                    path.unshift(selector);
                    break;
                } else {
                    let sib: Element | null = curr;
                    let nth = 1;
                    while ((sib = sib.previousElementSibling)) {
                        if (sib.tagName.toLowerCase() === selector) nth++;
                    }
                    if (nth !== 1) selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
                curr = curr.parentElement;
            }
            return path.join(" > ");
        }
    },
});
