export const httpStatus = {
    // Informational responses (100–199)
    CONTINUE: 100,
    SWITCHING_PROTOCOLS: 101,
    PROCESSING: 102,
    EARLY_HINTS: 103,

    // Successful responses (200–299)
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NON_AUTHORITATIVE_INFORMATION: 203,
    NO_CONTENT: 204,
    RESET_CONTENT: 205,
    PARTIAL_CONTENT: 206,
    MULTI_STATUS: 207,
    ALREADY_REPORTED: 208,
    IM_USED: 226,

    // Redirection messages (300–399)
    MULTIPLE_CHOICES: 300,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    SEE_OTHER: 303,
    NOT_MODIFIED: 304,
    USE_PROXY: 305,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,

    // Client error responses (400–499)
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    NOT_ACCEPTABLE: 406,
    PROXY_AUTHENTICATION_REQUIRED: 407,
    REQUEST_TIMEOUT: 408,
    CONFLICT: 409,
    GONE: 410,
    LENGTH_REQUIRED: 411,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    URI_TOO_LONG: 414,
    UNSUPPORTED_MEDIA_TYPE: 415,
    RANGE_NOT_SATISFIABLE: 416,
    EXPECTATION_FAILED: 417,
    IM_A_TEAPOT: 418,
    MISDIRECTED_REQUEST: 421,
    UNPROCESSABLE_ENTITY: 422,
    LOCKED: 423,
    FAILED_DEPENDENCY: 424,
    TOO_EARLY: 425,
    UPGRADE_REQUIRED: 426,
    PRECONDITION_REQUIRED: 428,
    TOO_MANY_REQUESTS: 429,
    REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
    UNAVAILABLE_FOR_LEGAL_REASONS: 451,

    // Server error responses (500–599)
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    HTTP_VERSION_NOT_SUPPORTED: 505,
    VARIANT_ALSO_NEGOTIATES: 506,
    INSUFFICIENT_STORAGE: 507,
    LOOP_DETECTED: 508,
    NOT_EXTENDED: 510,
    NETWORK_AUTHENTICATION_REQUIRED: 511,

    // Unofficial codes
    CHECKPOINT: 103, // Unofficial (Checkpoint)
    THIS_IS_FINE: 218, // Unofficial (Apache Web Server)
    PAGE_EXPIRED: 419, // Unofficial (Laravel Framework)
    ENHANCE_YOUR_CALM: 420, // Unofficial (Twitter)
    BLOCKED_BY_WINDOWS_PARENTAL_CONTROLS: 450, // Unofficial (Microsoft)
    INVALID_TOKEN: 498, // Unofficial (Esri)
    TOKEN_REQUIRED: 499, // Unofficial (Esri)
    BANDWIDTH_LIMIT_EXCEEDED: 509, // Unofficial (Apache Web Server)
    SITE_IS_FROZEN: 530, // Unofficial (Pantheon)

    // Internet Information Services (IIS)
    LOGIN_TIMEOUT: 440, // IIS
    RETRY_WITH: 449, // IIS
    REDIRECT: 451, // IIS

    // nginx
    NO_RESPONSE: 444, // nginx
    SSL_CERTIFICATE_ERROR: 495, // nginx
    SSL_CERTIFICATE_REQUIRED: 496, // nginx
    HTTP_REQUEST_SENT_TO_HTTPS_PORT: 497, // nginx
    CLIENT_CLOSED_REQUEST: 499, // nginx

    // Cloudflare
    UNKNOWN_ERROR: 520, // Cloudflare
    WEB_SERVER_IS_DOWN: 521, // Cloudflare
    CONNECTION_TIMED_OUT: 522, // Cloudflare
    ORIGIN_IS_UNREACHABLE: 523, // Cloudflare
    A_TIMEOUT_OCCURRED: 524, // Cloudflare
    SSL_HANDSHAKE_FAILED: 525, // Cloudflare
    INVALID_SSL_CERTIFICATE: 526, // Cloudflare
    RAILGUN_ERROR: 527, // Cloudflare
    SITE_OVERLOADED: 529, // Cloudflare

    // AWS Elastic Load Balancing
    ORIGIN_DNS_ERROR: 530, // AWS ELB

    // Caching warning codes (obsoleted)
    RESPONSE_IS_STALE: 110, // Caching (obsoleted)
    REVALIDATION_FAILED: 111, // Caching (obsoleted)
    DISCONNECTED_OPERATION: 112, // Caching (obsoleted)
    HEURISTIC_EXPIRATION: 113, // Caching (obsoleted)
    MISCELLANEOUS_WARNING: 199, // Caching (obsoleted)
    TRANSFORMATION_APPLIED: 214, // Caching (obsoleted)
    MISCELLANEOUS_PERSISTENT_WARNING: 299, // Caching (obsoleted)

    // Custom status codes
    TOO_MANY_CONCURRENT_REQUESTS: 430,
    DEMO_LIMIT_EXIT: 432,
    NO_INPUT_SPECIFIED: 452,
    UNKNOWN_CONVERSION_OPTION: 453,
    TOO_COMPLEX_INPUT: 454, // The input is too complex or large. It cannot be converted.
    CONVERSION_SYSTEM_ERROR: 455, // The conversion cannot be completed due to a system error.
    WRONG_INPUT_FILE: 456, // The input file is not specified correctly. Multipart/form-data is required for file upload.
    UNKNOWN_FILE_TYPE: 457, // The type of the input file is unknown. The file has no extension.
    CONVERSION_TIME_EXCEEDED: 458, // The request was aborted because it took a long time.
    BAD_ARCHIVE: 459, // The uploaded archive cannot be processed. It is too large, corrupted, or contains symbolic links.
    INVALID_VALUE: 470, // A conversion option is set to an invalid value.
    NAVIGATION_FAILED: 471, // The input URL cannot be loaded.
    TOO_MANY_SUB_REQUESTS: 472, // Exceeded the maximum number of subrequests during the conversion.
    MAIN_FRAME_ERROR: 473, // The main frame failed with HTTP code >= 400.
    INVALID_SIGN_IN_TOKEN: 473, // The main frame failed with HTTP code >= 400.
    PERFORMANCE_STANDBY_NODE: 473, // The main frame failed with HTTP code >= 400.
    URL_LOAD_ERROR: 474, // One or more subrequests failed with HTTP code >= 400 or some subrequests are still pending.
    USER_UNAUTHORIZED: 474, // One or more subrequests failed with HTTP code >= 400 or some subrequests are still pending.
    CUSTOM_JAVASCRIPT_TIME_EXCEEDED: 475, // The request was aborted because the custom JavaScript took a long time.
    ELEMENT_NOT_FOUND: 476, // The element specified for printing or waiting for was not found in the input document.
    UNSUPPORTED_DOCUMENT_TYPE: 477, // The input document type is unknown or not supported.
    HOSTNAME_NOT_RESOLVED: 478, // The URL hostname could not be resolved.
    INVALID_URL: 479, // The URL is invalid.
    PENDING_DEVICE: 480, // The converter could not establish an HTTPS connection because of an invalid SSL certificate.
    REJECTED_DEVICE: 481, // There was a problem connecting to Pdfcrowd servers over HTTPS.
    INPUT_DATA_ERROR: 482, // The input template or data is invalid.
    PASSWORD_PROTECTED_INPUT: 483, // The input is password protected. Provide a valid password.
    UNSUPPORTED_INPUT_FEATURE: 484, // The input contains an unsupported feature, typically a font type.
    ONLOAD_JAVASCRIPT_ERROR: 485, // An error occurred while executing the OnLoad JavaScript.
} as const;
