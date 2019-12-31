import * as crypto from 'crypto';
import { sbvrUtils } from '@resin/pinejs';
import { addDeleteHookForDependents } from '../../platform';
import { REGISTRY2_HOST } from '../../lib/config';

const { root } = sbvrUtils;

sbvrUtils.addPureHook('POST', 'resin', 'image', {
	POSTPARSE: async ({ request, api, tx }) => {
		const maxAttempts = 5;
		for (let i = 0; i < maxAttempts; i++) {
			const candidate =
				REGISTRY2_HOST +
				'/v2/' +
				crypto
					.pseudoRandomBytes(16)
					.toString('hex')
					.toLowerCase();

			const count = await api.get({
				resource: 'image/$count',
				passthrough: {
					tx,
					req: root,
				},
				options: {
					$filter: {
						is_stored_at__image_location: candidate,
					},
				},
			});
			if (count === 0) {
				request.values.is_stored_at__image_location = candidate;
				return;
			}
		}

		throw new Error('Could not generate unique image location');
	},
});

addDeleteHookForDependents('image', [
	['image_install', 'installs__image'],
	['image__is_part_of__release', 'image'],
	['gateway_download', 'image'],
]);
