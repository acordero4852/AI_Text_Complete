let currentField = null;
let suggestionBox = null;
let selectedIndex = -1;

function createSuggestionBox() {
    const box = document.createElement('div');
    box.id = 'ai-suggestion-box';
    document.body.appendChild(box);
    return box;
}

function positionSuggestionBox(field) {
    const rect = field.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    suggestionBox.style.left = `${rect.left + scrollX}px`;
    suggestionBox.style.top = `${rect.bottom + scrollY}px`;
    suggestionBox.style.width = `${rect.width}px`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function getAISuggestions(text) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'get_suggestions',
            prompt: text
        });
        
        if (response.error) {
            console.error('Error:', response.error);
            return [];
        }
        
        return response.suggestions || [];
    } catch (error) {
        console.error('Error getting suggestions:', error);
        return [];
    }
}

function applySuggestion(suggestion) {
    if (!currentField) return;
    
    if (currentField.isContentEditable) {
        currentField.textContent = suggestion;
    } else {
        currentField.value = suggestion;
    }
    
    suggestionBox.style.display = 'none';
    selectedIndex = -1;
}

const updateSuggestions = debounce(async (field) => {
    const text = field.value || field.textContent;
    if (text.length < 3) {
        suggestionBox.style.display = 'none';
        return;
    }

    const suggestions = await getAISuggestions(text);
    if (suggestions && suggestions.length > 0) {
        suggestionBox.innerHTML = suggestions
            .map((suggestion, index) => `
                <div class="suggestion-item ${index === selectedIndex ? 'selected' : ''}"
                     onclick="this.dispatchEvent(new CustomEvent('select-suggestion', {
                         bubbles: true,
                         detail: { suggestion: '${suggestion.replace(/'/g, "\\'")}' }
                     }))">
                    ${suggestion}
                </div>
            `).join('');
        suggestionBox.style.display = 'block';
        positionSuggestionBox(field);
    } else {
        suggestionBox.style.display = 'none';
    }
}, 500);

function handleInput(event) {
    currentField = event.target;
    updateSuggestions(currentField);
}

function handleKeydown(event) {
    if (!suggestionBox || suggestionBox.style.display === 'none') return;
    
    const items = suggestionBox.querySelectorAll('.suggestion-item');
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            break;
        case 'Enter':
            event.preventDefault();
            if (selectedIndex >= 0) {
                const selectedItem = items[selectedIndex];
                applySuggestion(selectedItem.textContent);
            }
            break;
        case 'Escape':
            suggestionBox.style.display = 'none';
            selectedIndex = -1;
            break;
    }
    
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });
}

function init() {
    if (!suggestionBox) {
        suggestionBox = createSuggestionBox();
    }

    document.addEventListener('click', (e) => {
        if (!suggestionBox.contains(e.target)) {
            suggestionBox.style.display = 'none';
            selectedIndex = -1;
        }
    });

    suggestionBox.addEventListener('select-suggestion', (e) => {
        applySuggestion(e.detail.suggestion);
    });

    const textFields = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
    textFields.forEach(field => {
        field.addEventListener('input', handleInput);
        field.addEventListener('keydown', handleKeydown);
    });

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const newFields = node.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
                    newFields.forEach(field => {
                        field.addEventListener('input', handleInput);
                        field.addEventListener('keydown', handleKeydown);
                    });
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

document.addEventListener('DOMContentLoaded', init);
init();