const path = require('path')
const setupPlugins = function ({ root }) {
    const plugins = [
        async function tailwindPlugin(context, options) {
            return {
                name: 'docusaurus-tailwindcss',
                configurePostCss(postcssOptions) {
                    // Appends TailwindCSS and AutoPrefixer.
                    postcssOptions.plugins.push(require('tailwindcss'))
                    postcssOptions.plugins.push(require('autoprefixer'))
                    return postcssOptions
                },
            }
        },

        // Handle "back to main menu" issue with Docusaurus
        // When the rendered webpage zoomed to 200%, the "back to main menu" is not functional.
        // This function removes the DOM element after rendering.
        function handleBackToMainMenuBtn(context, options) {
            return {
                name: 'handle-back-to-main-btn',
                injectHtmlTags({ content }) {
                    return {
                        postBodyTags: [
                            `<script>
                document.addEventListener('keyup', (event)=> {
                  if(event.key === 'Tab') {
                    const backBtn = document.querySelector(".navbar-sidebar__back");
                    if(backBtn) backBtn.style.display = "none";
                  }

                  if(event.key === 'Escape') {
                    const closeBtn = document.querySelector(".navbar-sidebar__close");
                    closeBtn.click();
                  }
                });
              
                window.addEventListener('resize', () => {
                  const backBtn = document.querySelector(".navbar-sidebar__back");
                  if(backBtn) backBtn.style.display = "none";
                });
            </script>`,
                        ],
                    }
                },
            }
        },
    ]

    return plugins
}

module.exports = setupPlugins