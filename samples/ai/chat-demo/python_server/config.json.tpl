{
  "model": {
    "name": "{{model_name}}",
    "api_version": "{{api_version}}",
    
{{#parameters.systemWithQuote}}
    "system_prompt": {
{{#o1}}
        "role": "developer",
{{/o1}}
{{^o1}}
        "role": "system",
{{/o1}}
        "content": {{{parameters.systemWithQuote}}},
    },
{{/parameters.systemWithQuote}}
    "parameters": {
      
{{#response_format}}
        "response_format": {{{response_format}}},
{{/response_format}}
{{#parameters.max_tokens}}
{{#o1}}
        "max_completion_tokens": {{parameters.max_tokens}},
{{/o1}}
{{^o1}}
        "max_tokens" : {{parameters.max_tokens}},
{{/o1}}
{{/parameters.max_tokens}}
{{#parameters.temperature}}
        "temperature": {{.}},
{{/parameters.temperature}}
{{#parameters.top_p}}
        "top_p": {{.}},
{{/parameters.top_p}}
{{#parameters.frequency_penalty}}
        "frequency_penalty": {{.}},
{{/parameters.frequency_penalty}}
{{#parameters.presence_penalty}}
        "presence_penalty": {{.}},
{{/parameters.presence_penalty}}
{{#parameters.reasoning_effort}}
        "reasoning_effort": "{{.}}",
{{/parameters.reasoning_effort}}
{{#parameters.verbosity}}
        "verbosity": "{{.}}",
{{/parameters.verbosity}}
    }
  }
}
