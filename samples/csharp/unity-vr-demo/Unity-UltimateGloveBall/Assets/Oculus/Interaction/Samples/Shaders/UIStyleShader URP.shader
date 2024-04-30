Shader "Oculus/Interaction/UIStyle URP"
{
    Properties
    {
        [MainColor] _Color("Color", Color) = (1, 1, 1, 1)
    }

    SubShader
    {
        Tags { "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" }
        Blend SrcAlpha OneMinusSrcAlpha
        /*
        LOD 100
        AlphaToMask Off
        Cull Back
        ColorMask RGBA
        ZWrite Off
        ZTest LEqual
        Offset 0, 0
        */

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS   : POSITION;
                half4 vertexColor : COLOR;
                half3 normal : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionHCS  : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                half3 normal : TEXCOORD2;
                half4 vertexColor : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);
                UNITY_TRANSFER_INSTANCE_ID(IN, OUT);
                OUT.normal = TransformObjectToWorldNormal(IN.normal);
                half pulse = sin(_Time.z) * 0.5 + 0.5;
                float4 vertexPos = TransformObjectToHClip(IN.positionOS);
                vertexPos.xyz = vertexPos + ((0.002 * pulse) * OUT.normal * IN.vertexColor.a);
                OUT.positionHCS = vertexPos;
                OUT.vertexColor = IN.vertexColor;
                OUT.worldPos = TransformObjectToWorld(IN.positionOS).xyz;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(IN);
                float3 worldViewDir = normalize(GetWorldSpaceViewDir(IN.worldPos));
                half3 worldNormal = IN.normal;
                half fresnel = saturate(dot(worldViewDir, worldNormal));
                fresnel = saturate(pow(fresnel + .1, 3) * 2);

                half opacity = fresnel * IN.vertexColor.a;

                //half4 debug = half4(IN.vertexColor.a, IN.vertexColor.a, IN.vertexColor.a, 1.0);

                half4 finalColor = _Color * IN.vertexColor;
                return half4(finalColor.rgb, opacity);
                
            }
            ENDHLSL
        }
    }
}
