import {PathItem} from "../../models";
import {POST} from "./Methods";

export function Path({pathItem, path}: { pathItem: PathItem, path: string }): React.JSX.Element {
	// console.log(pathItem);
	return (<div>
		<div>
			{pathItem.post && <POST post={pathItem.post} path={path}/>}
		</div>
	
	</div>)
}
