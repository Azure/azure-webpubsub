#ifndef AVATAR_GHOST_EFFECT_INCLUDED
#define AVATAR_GHOST_EFFECT_INCLUDED

// This Shader is based on the output of ShaderGraph "GhostAvatar"
#include "UnityCG.cginc"
#include "ShaderGraphFunctions.cginc"

#define ATTRIBUTES_NEED_NORMAL
#define ATTRIBUTES_NEED_TANGENT
#define FEATURES_GRAPH_VERTEX
#define SHADERPASS SHADERPASS_DEPTHONLY

float  _Opacity;
float2 Fresnel_Noise_Speed;
float2 Fresnel_Noise_Scale;
float4 FresnelNoise_TexelSize;
float  Fresnel_Power;
float4 Fresnel_Color;
float4 Interior_Color;
float4 Caustics_Color;

// Object and Global properties
Texture2D FresnelNoise;
SamplerState samplerFresnelNoise;

#define PLATFORM_SAMPLE_TEXTURE2D(textureName, samplerName, coord2) textureName.Sample(samplerName, coord2)
#define TEXTURE2D_PARAM(textureName, samplerName)   Texture2D textureName, SamplerState samplerName
#define TEXTURE2D_ARGS(textureName, samplerName)                textureName, samplerName
#define UnityBuildTexture2DStructNoScale(n) UnityBuildTexture2DStructInternal(TEXTURE2D_ARGS(n, sampler##n), n##_TexelSize, float4(1, 1, 0, 0))

void Unity_Dither_float(float In, float4 ScreenPosition, out float Out)
{
    float2 uv = ScreenPosition.xy * _ScreenParams.xy;
    float  DITHER_THRESHOLDS[16] =
    {
        1.0 / 17.0, 9.0 / 17.0, 3.0 / 17.0, 11.0 / 17.0,
        13.0 / 17.0, 5.0 / 17.0, 15.0 / 17.0, 7.0 / 17.0,
        4.0 / 17.0, 12.0 / 17.0, 2.0 / 17.0, 10.0 / 17.0,
        16.0 / 17.0, 8.0 / 17.0, 14.0 / 17.0, 6.0 / 17.0
    };
    uint index = (uint(uv.x) % 4) * 4 + uint(uv.y) % 4;
    Out = In - DITHER_THRESHOLDS[index];
}

void Unity_FresnelEffect_float(float3 Normal, float3 ViewDir, float Power, out float Out)
{
    Out = pow((1.0 - saturate(dot(normalize(Normal), normalize(ViewDir)))), Power);
}

struct Bindings_Fresnel_9a3df2e25ac979b46b846712876be954_float {
    float3 WorldSpaceNormal;
    float3 WorldSpaceViewDirection;
};

struct UnitySamplerState
{
    SamplerState samplerstate;
};

struct UnityTexture2D
{
    Texture2D tex;
    SamplerState samplerstate;
    float4 texelSize;
    float4 scaleTranslate;

    // these functions allows users to convert code using Texture2D to UnityTexture2D by simply changing the type of the variable
    // the existing texture macros will call these functions, which will forward the call to the texture appropriately
    float4 Sample(UnitySamplerState s, float2 uv) { return PLATFORM_SAMPLE_TEXTURE2D(tex, s.samplerstate, uv); }
    
    float2 GetTransformedUV(float2 uv) { return uv * scaleTranslate.xy + scaleTranslate.zw; }

    #ifndef SHADER_API_GLES
        float4 Sample( SamplerState s, float2 uv) { return PLATFORM_SAMPLE_TEXTURE2D(tex, s, uv); }
    #endif
};


UnityTexture2D UnityBuildTexture2DStructInternal(TEXTURE2D_PARAM(tex, samplerstate), float4 texelSize, float4 scaleTranslate)
{
    UnityTexture2D result;
    result.tex = tex;
    #ifndef SHADER_API_GLES
        result.samplerstate = samplerstate;
    #endif
    result.texelSize = texelSize;
    result.scaleTranslate = scaleTranslate;
    return result;
}

void SG_Fresnel_9a3df2e25ac979b46b846712876be954_float(float4 Color_DA10CA39, float4 Color_CD9DA168, float Vector1_D6768803, Bindings_Fresnel_9a3df2e25ac979b46b846712876be954_float IN, out float4 OutVector4_1)
{
    float4 _Property_2cee21938393442985ac670e276ff9c4_Out_0 = Color_DA10CA39;
    float4 _Property_ce6acd58766746d2a7cf3c439146b80e_Out_0 = Color_CD9DA168;
    float  _Property_7e576b45cd604717b593187027ba949b_Out_0 = Vector1_D6768803;
    float  _FresnelEffect_d5ad68651922488c914cef2362baea7e_Out_3;
    Unity_FresnelEffect_float(IN.WorldSpaceNormal, IN.WorldSpaceViewDirection, _Property_7e576b45cd604717b593187027ba949b_Out_0, _FresnelEffect_d5ad68651922488c914cef2362baea7e_Out_3);
    float4 _Multiply_d3dc48e328324bf4a989dbedc63f8994_Out_2;
    Unity_Multiply_float4_float4(_Property_ce6acd58766746d2a7cf3c439146b80e_Out_0, (_FresnelEffect_d5ad68651922488c914cef2362baea7e_Out_3.xxxx), _Multiply_d3dc48e328324bf4a989dbedc63f8994_Out_2);
    float4 _Add_65b3d1c984c54b8285745ccc8e69b25f_Out_2;
    Unity_Add_float4(_Property_2cee21938393442985ac670e276ff9c4_Out_0, _Multiply_d3dc48e328324bf4a989dbedc63f8994_Out_2, _Add_65b3d1c984c54b8285745ccc8e69b25f_Out_2);
    OutVector4_1 = _Add_65b3d1c984c54b8285745ccc8e69b25f_Out_2;
}

void GhostBallEffect(float3 WorldSpaceNormal, float3 WorldSpaceViewDirection, float4 ScreenPosition, float4 uv0, out float3 BaseColor, out float Alpha, out float AlphaClipThreshold)
{
    UnityTexture2D _Property_5b4fbd1761d044e6aa9402d0eaae3fdd_Out_0 = UnityBuildTexture2DStructNoScale(FresnelNoise);
    float2         _Property_7f322e0e9438413b973c5b9d17509040_Out_0 = Fresnel_Noise_Scale;
    float2         _Property_ffdc92934e72434cb23aa450bdeb8116_Out_0 = Fresnel_Noise_Speed;
    float2         _Multiply_daa3d6fcaaf042dea98851ced544737d_Out_2;
    Unity_Multiply_float2_float2(_Property_ffdc92934e72434cb23aa450bdeb8116_Out_0, (_Time.y), _Multiply_daa3d6fcaaf042dea98851ced544737d_Out_2);
    float2 _TilingAndOffset_505747525733416486ad31ff6852d858_Out_3;
    Unity_TilingAndOffset_float(uv0.xy, _Property_7f322e0e9438413b973c5b9d17509040_Out_0, _Multiply_daa3d6fcaaf042dea98851ced544737d_Out_2, _TilingAndOffset_505747525733416486ad31ff6852d858_Out_3);
    float4 _SampleTexture2D_3187dd0468f445959ceb46f70d5e5b31_RGBA_0 = PLATFORM_SAMPLE_TEXTURE2D(_Property_5b4fbd1761d044e6aa9402d0eaae3fdd_Out_0.tex, _Property_5b4fbd1761d044e6aa9402d0eaae3fdd_Out_0.samplerstate,
                                                                                       _Property_5b4fbd1761d044e6aa9402d0eaae3fdd_Out_0.GetTransformedUV(_TilingAndOffset_505747525733416486ad31ff6852d858_Out_3));
    float4                                                  _Property_68898f8f92ae4d8ca567f00cb00241d7_Out_0 = Fresnel_Color;
    float4                                                  _Property_c81274cdfa084746a26273090735c2af_Out_0 = Interior_Color;
    float                                                   _Property_6a826196eff24c159a6b2b54c24552cb_Out_0 = Fresnel_Power;
    Bindings_Fresnel_9a3df2e25ac979b46b846712876be954_float _Fresnel_f9dfff35ffa440afb68b4dab5b875063;
    _Fresnel_f9dfff35ffa440afb68b4dab5b875063.WorldSpaceNormal = WorldSpaceNormal;
    _Fresnel_f9dfff35ffa440afb68b4dab5b875063.WorldSpaceViewDirection = WorldSpaceViewDirection;
    float4 _Fresnel_f9dfff35ffa440afb68b4dab5b875063_OutVector4_1;
    SG_Fresnel_9a3df2e25ac979b46b846712876be954_float(_Property_68898f8f92ae4d8ca567f00cb00241d7_Out_0, _Property_c81274cdfa084746a26273090735c2af_Out_0, _Property_6a826196eff24c159a6b2b54c24552cb_Out_0,
                                                      _Fresnel_f9dfff35ffa440afb68b4dab5b875063, _Fresnel_f9dfff35ffa440afb68b4dab5b875063_OutVector4_1);
    float4 _Add_31142e6cef6e4aac97766002da8aec28_Out_2;
    Unity_Add_float4(_SampleTexture2D_3187dd0468f445959ceb46f70d5e5b31_RGBA_0 * 12 * Caustics_Color, _Fresnel_f9dfff35ffa440afb68b4dab5b875063_OutVector4_1, _Add_31142e6cef6e4aac97766002da8aec28_Out_2);
    float _Dither_fd8dde5e46d34251a6e9e9884c1354b8_Out_2;
    Unity_Dither_float(1, float4(ScreenPosition.xy / ScreenPosition.w, 0, 0), _Dither_fd8dde5e46d34251a6e9e9884c1354b8_Out_2);
    BaseColor = (_Add_31142e6cef6e4aac97766002da8aec28_Out_2.xyz);
    Alpha = _Opacity;
    AlphaClipThreshold = _Dither_fd8dde5e46d34251a6e9e9884c1354b8_Out_2;
}

float4 ApplyGhostEffect(float4 color, float3 worldNormal, float3 worldPos, float4 screenPos, float4 uv)
{
    float outAlphaGhost, outAlphaClip;
    float3 outColGhost;
    GhostBallEffect(worldNormal,worldPos,screenPos, uv, outColGhost, outAlphaGhost, outAlphaClip);
    color.rgb *= outColGhost; 
    color.a = min(color.a, outAlphaGhost);
    // We already do alphaClip on < 0.5 in AvatarUnityLighting.cginc
    // so we put alpha at 0 if we want it to be clipped
    //clip(c.a - outAlphaClip);
    if (color.a - outAlphaClip < 0)
    {
        color.a = 0; 
    }
    return color;
}

#endif // AVATAR_GHOST_EFFECT_INCLUDED
