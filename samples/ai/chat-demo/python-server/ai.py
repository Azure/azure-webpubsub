"""AI Chat Module with Streaming Support

This module provides methods to interact with GitHub AI models,
supporting both streaming and non-streaming responses.

> pip install openai python-dotenv
"""
import os
from typing import Iterator, Union, Optional, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class AIChat:
    """AI Chat client with streaming support"""
    
    def __init__(self):
        """Initialize the AI client with GitHub AI models"""
        # To authenticate with the model you will need to generate a personal access token (PAT) in your GitHub settings.
        # Create your PAT token by following instructions here: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
        self.api_key = os.environ.get("GITHUB_TOKEN")
        self.api_version = os.environ.get("API_VERSION", "2024-08-01-preview")
        self.model_name = os.environ.get("MODEL_NAME", "gpt-4o-mini")
        
        if not self.api_key:
            raise ValueError("GITHUB_TOKEN environment variable is required")
        
        self.client = OpenAI(
            base_url="https://models.github.ai/inference",
            api_key=self.api_key,
            default_query={
                "api-version": self.api_version,
            },
        )
    
    def chat_stream(
        self, 
        text_input: str, 
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = True
    ) -> Iterator[str]:
        """
        Generate a streaming response for the given text input.
        
        Args:
            text_input (str): The user's input text
            conversation_history (List[Dict], optional): Previous conversation messages
            temperature (float): Response creativity (0.0 - 2.0)
            max_tokens (int, optional): Maximum tokens in response
            stream (bool): Whether to stream the response

        Yields:
            str: Streaming chunks of the AI response
            
        Example:
            ai = AIChat()
            for chunk in ai.chat_stream("Hello, how are you?"):
                print(chunk, end="", flush=True)
        """
        messages = []
        
        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history)
        
        # Add current user message
        messages.append({
            "role": "user",
            "content": text_input
        })
        
        try:
            response = self.client.chat.completions.create(
                messages=messages,
                model=self.model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream
            )

            if not stream:
                if response.choices and len(response.choices) > 0:
                    return response.choices[0].message.content
                else:
                    return "Error: Empty response from AI model - check your API access and model availability"
            else:
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        if chunk.choices[0].delta.content is not None:
                            yield chunk.choices[0].delta.content
                else:
                    yield "Warning: Empty response from AI model"
                    
        except Exception as e:
            yield f"Error: {str(e)}"
    
# Convenience functions for direct use
_ai_instance = None

def get_ai_instance() -> AIChat:
    """Get a singleton AI instance"""
    global _ai_instance
    if _ai_instance is None:
        _ai_instance = AIChat()
    return _ai_instance

def chat_stream(text_input: str, **kwargs) -> Iterator[str]:
    """
    Convenience function for streaming chat.
    
    Args:
        text_input (str): The user's input text
        **kwargs: Additional arguments passed to AIChat.chat_stream()
        
    Yields:
        str: Streaming chunks of the AI response
    """
    ai = get_ai_instance()
    yield from ai.chat_stream(text_input, **kwargs)

def chat(text_input: str, **kwargs) -> str:
    """
    Convenience function for non-streaming chat.
    
    Args:
        text_input (str): The user's input text
        **kwargs: Additional arguments passed to AIChat.chat()
        
    Returns:
        str: Complete AI response
    """
    ai = get_ai_instance()
    return ai.chat(text_input, **kwargs)

# Example usage and testing
if __name__ == "__main__":
    try:
        ai = AIChat()
        
        # Test non-streaming
        print("=== Non-streaming example ===")
        response = ai.chat("Hello! Please introduce yourself briefly.")
        print(f"Response: {response}")
        
        print("\n=== Streaming example ===")
        print("Response: ", end="")
        for chunk in ai.chat_stream("Tell me a short story about a robot."):
            print(chunk, end="", flush=True)
        print("\n")
        
    except Exception as e:
        print(f"Error: {e}")
        print("Please ensure GITHUB_TOKEN environment variable is set.")
