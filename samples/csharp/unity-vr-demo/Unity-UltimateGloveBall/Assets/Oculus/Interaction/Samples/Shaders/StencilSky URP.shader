Shader "Oculus/Interaction/StencilSky URP"
{
    Properties
    {
		_MainTex("MainTex", 2D) = "white" {}
		_ColorLight("Light Color", Color) = (0,0,0,0)
		_ColorDark("Dark Color", Color) = (0, 0, 0, 0)
		_DitherStrength("Dither Strength", int) = 16
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS   : POSITION;
                half2 texcoord : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionHCS  : SV_POSITION;
                half2 texcoord : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
				half4 _ColorLight;
                half4 _ColorDark;
                half _DitherStrength;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);
                UNITY_TRANSFER_INSTANCE_ID(IN, OUT);
                OUT.positionHCS = TransformObjectToHClip(IN.positionOS);
                OUT.texcoord = TRANSFORM_TEX(IN.texcoord, _MainTex);
                return OUT;
            }

            half DitherAnimatedNoise(half2 screenPos) {
			    half noise = frac(
			        dot(uint3(screenPos, floor(fmod(_Time.y * 10, 4))), uint3(2, 7, 23) / 17.0f));
				noise -= 0.5; // remap from [0..1[ to [-0.5..0.5[
                half noiseScaled = (noise / _DitherStrength);
				return noiseScaled;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(IN);
                //half ditherNoise = DitherAnimatedNoise(IN.positionHCS.xy);
                half4 mainTexture = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, IN.texcoord);
                half4 finalColor = lerp(_ColorDark, _ColorLight, mainTexture.r);// + ditherNoise);
                return finalColor;
            }
            ENDHLSL
        }
    }
}