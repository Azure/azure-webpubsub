{
  "model": {
    "name": "{{model_name}}",
    "api_version": "{{api_version}}",
    
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
    "parameters": {{{parameters_json}}}
  }
}
