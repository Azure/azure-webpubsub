{
  "model": {
{{#systemWithQuote}}
    "system_prompt": {
{{#o1}}
        "role": "developer",
{{/o1}}
{{^o1}}
        "role": "system",
{{/o1}}
        "content": {{{systemWithQuote}}}
    },
{{/systemWithQuote}}
{{#parameters_json}}
    "parameters": {{{parameters_json}}},
{{/parameters_json}}
    "api_version": "{{api_version}}",
    "name": "{{model_name}}"
  }
}
