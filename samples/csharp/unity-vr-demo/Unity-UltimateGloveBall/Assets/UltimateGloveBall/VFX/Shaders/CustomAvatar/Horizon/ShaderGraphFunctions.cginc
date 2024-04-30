#ifndef SHADER_GRAPH_FUNCTIONS_INCLUDED
#define SHADER_GRAPH_FUNCTIONS_INCLUDED

void Unity_Add_float(float A, float B, out float Out)
{
    Out = A + B;
}

void Unity_Multiply_float_float(float A, float B, out float Out)
{
    Out = A * B;
}

void Unity_Subtract_float(float A, float B, out float Out)
{
    Out = A - B;
}

void Unity_Add_float4(float4 A, float4 B, out float4 Out)
{
    Out = A + B;
}

void Unity_Saturate_float4(float4 In, out float4 Out)
{
    Out = saturate(In);
}

void Unity_Smoothstep_float4(float4 Edge1, float4 Edge2, float4 In, out float4 Out)
{
    Out = smoothstep(Edge1, Edge2, In);
}

void Unity_OneMinus_float4(float4 In, out float4 Out)
{
    Out = 1 - In;
}

void Unity_Multiply_float4_float4(float4 A, float4 B, out float4 Out)
{
    Out = A * B;
}

void Unity_Subtract_float4(float4 A, float4 B, out float4 Out)
{
    Out = A - B;
}
void Unity_Multiply_float2_float2(float2 A, float2 B, out float2 Out)
{
    Out = A * B;
}

void Unity_TilingAndOffset_float(float2 UV, float2 Tiling, float2 Offset, out float2 Out)
{
    Out = UV * Tiling + Offset;
}


#endif // SHADER_GRAPH_FUNCTIONS_INCLUDED
