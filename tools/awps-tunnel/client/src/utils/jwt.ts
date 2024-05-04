import {jwtVerify, SignJWT, type JWTPayload} from 'jose';

export const generateJWT = async (userId: string, audience: string): Promise<string> => {
	const secretKey = new TextEncoder().encode('AJ9Mut2U9zh43HcZnqVSBLwIJcemF/+R0ju/QYMZ470=');
	const jwt = await new SignJWT({userId})
		.setProtectedHeader({alg: 'HS256'})
		.setIssuedAt()
		.setAudience(audience)
		.setExpirationTime('1h')
		.sign(secretKey);
	
	return jwt;
};

export const verifyJWT = async (token: string): Promise<JWTPayload | undefined> => {
	try {
		const secretKey = new TextEncoder().encode('your-256-bit-secret'); // Use the same secret key
		const {payload} = await jwtVerify(token, secretKey);
		return payload;
	} catch (error) {
		console.error('JWT verification failed:', error);
		return undefined;
	}
};
