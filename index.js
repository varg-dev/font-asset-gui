
class Renderer extends gloperate.Renderer {

    _camera;                // : gloperate.Camera
    _navigation;            // : gloperate.Navigation

    _depthRenderbuffer;     // : gloperate.Renderbuffer
    _colorRenderTexture;    // : gloperate.Texture2D
    _intermediateFBO;       // : gloperate.Framebuffer
    _fontFaceFBO;           // : gloperate.Framebuffer

    _ndcTriangle;           // : gloperate.NdcFillingTriangle
    _ndcOffsetKernel;       // : gloperate.AntiAliasingKernel

    _defaultFBO;            // : gloperate.DefaultFramebuffer

    _accumulate;            // : gloperate.AccumulatePass
    _blit;                  // : gloperate.BlitPass


    _labelPass;		        // : gloperate.LabelRenderPass
    _labels;		        // : Array of gloperate.Labels
    
    _fontFace = null;       // : gloperate.FontFace

    _points;		        // : Float32Array
    _pointsBuffer;          // : WebGLBuffer
    _pointsProgram;	        // : gloperate.Program
    _uViewProjectionPoints; // : WebGLUniformLocation
    _uNdcOffsetPoints;      // : WebGLUniformLocation

    _lines;			        // : Float32Array
    _linesBuffer;  	        // : WebGLBuffer
    _linesProgram;	        // : gloperate.Program
    _uViewProjectionLines;  // : WebGLUniformLocation
    _uNdcOffsetLines;       // : WebGLUniformLocation

    _planeGeometry;         // : gloperate.PlaneGeometry
    _planeProgram;	        // : gloperate.Program
    _uViewProjectionPlane;  // : WebGLUniformLocation
    _uNdcOffsetPlane;       // : WebGLUniformLocation

    _debugBlit = false;     // : bool

    _zoomSrcBounds;         // : gloperate.vec4
    _zoomDstBounds;         // : gloperate.vec4


    onInitialize(context, callback, eventProvider) {
    
        const gl = context.gl;
        const gl2facade = this._context.gl2facade;
    
        this._defaultFBO = new gloperate.DefaultFramebuffer(context, 'DefaultFBO');
        this._defaultFBO.initialize();

        const internalFormatAndType = gloperate.Wizard.queryInternalTextureFormat(this._context,
            gl.RGBA, gloperate.Wizard.Precision.half);

        this._colorRenderTexture = new gloperate.Texture2D(this._context, 'ColorRenderTexture');
        this._colorRenderTexture.initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._colorRenderTexture.filter(gl.LINEAR, gl.LINEAR);

        this._depthRenderbuffer = new gloperate.Renderbuffer(this._context, 'DepthRenderbuffer');
        this._depthRenderbuffer.initialize(1, 1, gl.DEPTH_COMPONENT16);

        this._intermediateFBO = new gloperate.Framebuffer(this._context, 'IntermediateFBO');
        this._intermediateFBO.initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._colorRenderTexture],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer]]);    

        this._fontFaceFBO = new gloperate.Framebuffer(this._context, 'fontFaceFBO');



        this._camera = new gloperate.Camera();
        this._camera.up =     [ 0.0, 1.0, 0.0 ];
        this._camera.center = [ 0.121166, -0.688645, -0.010994 ];
        this._camera.eye =    [ 4.125616,  1.338718,  1.735594 ];
        this._camera.near = 0.1;
        this._camera.far = 32.0;

        this._navigation = new gloperate.Navigation(callback, eventProvider);
        this._navigation.camera = this._camera;

        this._ndcTriangle = new gloperate.NdcFillingTriangle(context);
        this._ndcTriangle.initialize(); 

        this._accumulate = new gloperate.AccumulatePass(context);
        this._accumulate.initialize(this._ndcTriangle);
        this._accumulate.precision = this._framePrecision;
        this._accumulate.texture = this._colorRenderTexture;
        this._accumulate.update();

        this._blit = new gloperate.BlitPass(this._context);
        this._blit.initialize(this._ndcTriangle);
        this._blit.readBuffer = gl2facade.COLOR_ATTACHMENT0;
        this._blit.target = this._defaultFBO;
        this._blit.drawBuffer = gl.BACK;
        this._blit.filter = gl.LINEAR;


        // setup point rendering

        this._points = new Float32Array([ // x, y, z, r, g, b, data,
            -0.8, +0.25, -1.0,  0.000, 0.533, 0.808,  16.0,
            -1.0, +0.25, -0.8,  0.792, 0.000, 0.365,  16.0,
            +2.0,  0.00, +2.0,  0.792, 0.792, 0.000,  16.0,
            -0.8, -0.80, -0.8,  0.000, 0.792, 0.365,  16.0,
            ]);

        this._lines = new Float32Array([ // x, y, z, r, g, b,
            -0.8, +0.25, -1.0,  0.000, 0.533, 0.808,
            +0.8, +0.25, -1.0,  0.000, 0.533, 0.808,
            -1.0, +0.25, -0.8,  0.792, 0.000, 0.365,
            -1.0, +0.25, +0.8,  0.792, 0.000, 0.365,
            -0.81, -0.80, +0.81,  0.000, 0.792, 0.365,
            -0.81, -0.80, -0.81,  0.000, 0.792, 0.365,
            -0.81, -0.80, -0.81,  0.000, 0.792, 0.365,
            +0.81, -0.80, -0.81,  0.000, 0.792, 0.365,
            ]);
    

        // would be better to use gloperate.Buffer (VBOs) but requires more knowledge ...

        this._pointsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._pointsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._points, gl.STATIC_DRAW);

        { 
            var vert = new gloperate.Shader(context, gl.VERTEX_SHADER, 'point.vert (in-line)');
            vert.initialize(`
                precision lowp float;

                layout(location = 0) in vec3 a_vertex;
                layout(location = 1) in vec3 a_color;
                layout(location = 2) in float a_data;

                uniform mat4 u_viewProjection;
                uniform vec2 u_ndcOffset;

                out vec4 v_color;

                void main()
                {
                    v_color = vec4(a_color, 1.0);

                    vec4 vertex = u_viewProjection * vec4(a_vertex, 1.0);
                    vertex.xy = u_ndcOffset * vec2(vertex.w) + vertex.xy;

                    gl_Position = vertex;
                    gl_PointSize = a_data;
                }
                `);
            
            var frag = new gloperate.Shader(context, gl.FRAGMENT_SHADER, 'point.frag (in-line)');
            frag.initialize(`
                precision lowp float;

                layout(location = 0) out vec4 fragColor;

                in vec4 v_color;

                void main(void)
                {
                    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;

                    float zz = dot(uv, uv);
                    if(zz > 1.0)
                        discard;

                    fragColor = v_color;
                }
                `);

            this._pointsProgram = new gloperate.Program(context, 'PointProgram');
            this._pointsProgram.initialize([vert, frag], false);

            this._pointsProgram.link();
            this._pointsProgram.bind();

            this._uViewProjectionPoints = this._pointsProgram.uniform('u_viewProjection');
            this._uNdcOffsetPoints = this._pointsProgram.uniform('u_ndcOffset');

            this._pointsProgram.attribute('a_vertex', 0);
            this._pointsProgram.attribute('a_color', 1);
            this._pointsProgram.attribute('a_data', 2);
        }

        // setup line rendering

        this._linesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._linesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._lines, gl.STATIC_DRAW);

        { 
            var vert = new gloperate.Shader(context, gl.VERTEX_SHADER, 'line.vert (in-line)');
            vert.initialize(`
                precision lowp float;

                layout(location = 0) in vec3 a_vertex;
                layout(location = 1) in vec3 a_color;

                uniform mat4 u_viewProjection;
                uniform vec2 u_ndcOffset;

                out vec4 v_color;

                void main()
                {
                    v_color = vec4(a_color, 1.0);

                    vec4 vertex = u_viewProjection * vec4(a_vertex, 1.0);
                    vertex.xy = u_ndcOffset * vec2(vertex.w) + vertex.xy;

                    gl_Position = vertex;
                }
                `);

            var frag = new gloperate.Shader(context, gl.FRAGMENT_SHADER, 'line.vert (in-line)');
            frag.initialize(`
                precision lowp float;

                layout(location = 0) out vec4 fragColor;

                in vec4 v_color;

                void main(void)
                {
                    fragColor = v_color;
                }
                `);

            this._linesProgram = new gloperate.Program(context, 'LineProgram');
            this._linesProgram.initialize([vert, frag], false);

            this._linesProgram.link();
            this._linesProgram.bind();

            this._uViewProjectionLines = this._linesProgram.uniform('u_viewProjection');
            this._uNdcOffsetLines = this._linesProgram.uniform('u_ndcOffset');
    
            this._linesProgram.attribute('a_vertex', 0);
            this._linesProgram.attribute('a_color', 1);
        }

        // setup full glyph atlas rendering

        this._planeGeometry = new gloperate.PlaneGeometry(context);
        this._planeGeometry.initialize();

        {
            var vert = new gloperate.Shader(context, gl.VERTEX_SHADER, 'plane.frag (in-line)');
            vert.initialize(`
                precision mediump float;

                layout(location = 0) in vec3 a_vertex;

                uniform mat4 u_viewProjection;
                uniform vec2 u_ndcOffset;

                uniform sampler2D u_glyphs;

                out vec2 v_uv;

                void main()
                {
                    v_uv = (a_vertex.xz + 1.0) * 0.5;

                    vec2 size = vec2(textureSize(u_glyphs, 0));
                    vec2 scale = max(vec2(1.0), size.xy / size.yx);

                    vec4 vertex = vec4(a_vertex, 1.0) * vec4(0.8 * scale.x, 1.0, 0.8 * scale.y, 1.0);
                    vertex -= vec4(-0.8 * (scale.x - 1.0), 0.8, -0.8 * (scale.y - 1.0), 0.0);

                    vertex = u_viewProjection * vertex;
                    vertex.xy = u_ndcOffset * vec2(vertex.w) + vertex.xy;

                    gl_Position = vertex;
                }
                `);

            // fragment shader COPIED from webgl-operate LabelRenderPass ...

            var frag = new gloperate.Shader(context, gl.FRAGMENT_SHADER, 'plane.frag (in-line)');
            frag.initialize(`
                precision mediump float;

                #if __VERSION__ == 100
                    #define fragColor gl_FragColor

                    #ifdef GL_OES_standard_derivatives
                        #extension GL_OES_standard_derivatives : enable
                        #define AASTEP
                    #endif
                #else
                    layout(location = 0) out vec4 fragColor;
                    #define AASTEP    
                #endif

                uniform sampler2D u_glyphs;
                uniform float u_aaStepScale;
                uniform int u_aaSampling;

                in vec2 v_uv;
                const int channel = 0;

                float aastep(float t, float value)
                {
                #ifdef AASTEP
                    float afwidth = fwidth(value) * u_aaStepScale;
                    return smoothstep(t - afwidth, t + afwidth, value);
                #else
                    return step(t, value);
                #endif
                }
                
                float texStep(float t, vec2 uv)
                {
                    float distanceValue = texture(u_glyphs, uv)[channel];
                    return step(t, distanceValue);
                }
                
                float texSmooth(float t, vec2 uv)
                {
                    float distanceValue = texture(u_glyphs, uv)[channel];
                    return aastep(t, distanceValue);
                }
                
                #ifdef AASTEP
                
                float aastep3h(float t, vec2 uv)
                {
                    float x = dFdy(uv.x) * 1.0 / 3.0;
                
                    float v = texSmooth(t, uv + vec2( -x, 0.0))
                            + texSmooth(t, uv + vec2(0.0, 0.0))
                            + texSmooth(t, uv + vec2( +x, 0.0));
                
                    return v / 3.0;
                }
                
                float aastep3v(float t, vec2 uv)
                {
                    float y = dFdy(uv.y) * 1.0 / 3.0;
                
                    float v = texSmooth(t, uv + vec2( 0.0,  -y))
                            + texSmooth(t, uv + vec2( 0.0, 0.0))
                            + texSmooth(t, uv + vec2( 0.0,  +y));
                
                    return v / 3.0;
                }
                
                float aastep3x3(float t, vec2 uv)
                {
                    float x = dFdx(uv.x) * 1.0 / 3.0;
                    float y = dFdy(uv.y) * 1.0 / 3.0;
                
                    float v = texSmooth(t, uv + vec2(  -x, -y)) + texSmooth(t, uv + vec2(  -x, 0.0)) + texSmooth(t, uv + vec2(  -x, +y))
                            + texSmooth(t, uv + vec2( 0.0, -y)) + texSmooth(t, uv + vec2( 0.0, 0.0)) + texSmooth(t, uv + vec2( 0.0, +y))
                            + texSmooth(t, uv + vec2(  +x, -y)) + texSmooth(t, uv + vec2(  +x, 0.0)) + texSmooth(t, uv + vec2(  +x, +y));
                
                    return v / 9.0;
                }
                
                float aastep4x4(float t, vec2 uv)
                {
                    float x0 = dFdx(uv.x);
                    float y0 = dFdx(uv.y);
                    float x1 = x0 * 1.0 / 8.0;
                    float y1 = y0 * 1.0 / 8.0;
                    float x2 = x0 * 3.0 / 8.0;
                    float y2 = y0 * 3.0 / 8.0;
                
                    float v = texSmooth(t, uv + vec2(-x2,-y2)) + texSmooth(t, uv + vec2(-x2,-y1))
                            + texSmooth(t, uv + vec2(-x2,+y1)) + texSmooth(t, uv + vec2(-x2,+y2))
                
                            + texSmooth(t, uv + vec2(-x1,-y2)) + texSmooth(t, uv + vec2(-x1,-y1))
                            + texSmooth(t, uv + vec2(-x1,+y1)) + texSmooth(t, uv + vec2(-x1,+y2))
                
                            + texSmooth(t, uv + vec2(+x1,-y2)) + texSmooth(t, uv + vec2(+x1,-y1))
                            + texSmooth(t, uv + vec2(+x1,+y1)) + texSmooth(t, uv + vec2(+x1,+y2))
                
                            + texSmooth(t, uv + vec2(+x2,-y2)) + texSmooth(t, uv + vec2(+x2,-y1))
                            + texSmooth(t, uv + vec2(+x2,+y1)) + texSmooth(t, uv + vec2(+x2,+y2));
                
                    return v / 16.0;
                }               
                #endif
                
                void main(void)
                {
                    /** @todo mipmap access? */
                
                    float a = 0.0;
                    /* When using multiframe sampling, might not be necessary and even tends to add more blur */
                #ifdef AASTEP
                    if(u_aaSampling == 0) {         // LabelRenderPass.Sampling.None
                #endif
                        a = texStep(0.5, v_uv);
            
                #ifdef AASTEP
                    } else if(u_aaSampling == 1) {  // LabelRenderPass.Sampling.Smooth
                        a = texSmooth(0.5, v_uv);
                    } else if(u_aaSampling == 2) {  // LabelRenderPass.Sampling.Horizontal3
                        a = aastep3h(0.5, v_uv);
                    } else if(u_aaSampling == 3) {  // LabelRenderPass.Sampling.Vertical3
                        a = aastep3v(0.5, v_uv);
                    } else if(u_aaSampling == 4) {  // LabelRenderPass.Sampling.Grid3x3
                        a = aastep3x3(0.5, v_uv);
                    } else if(u_aaSampling == 5) {  // LabelRenderPass.Sampling.Grid4x4
                        a = aastep4x4(0.5, v_uv);
                    }
                #endif
                
                    if(a <= 0.0) {
                        discard;
                    }
                    fragColor = vec4(vec3(1.0), a);
                }
                `);

            this._planeProgram = new gloperate.Program(context, 'PlaneProgram');
            this._planeProgram.initialize([vert, frag], false);

            this._planeProgram.link();
            this._planeProgram.bind();

            gl.uniform1i(this._planeProgram.uniform('u_glyphs'), 0); 
            gl.uniform1f(this._planeProgram.uniform('u_aaStepScale'), 0.5); 
            gl.uniform1i(this._planeProgram.uniform('u_aaSampling'), 1); 

            this._uViewProjectionPlane = this._planeProgram.uniform('u_viewProjection');
            this._uNdcOffsetPlane = this._planeProgram.uniform('u_ndcOffset');
    
            this._planeProgram.attribute('a_vertex', 0);
        }
        
        // setup label rendering

        this._labelPass = new gloperate.LabelRenderPass(context);
        this._labelPass.initialize();
        this._labelPass.camera = this._camera;
        this._labelPass.target = this._intermediateFBO;
        this._labelPass.depthMask = true;
        this._labelPass.aaStepScale = 1.0;
        this._labelPass.aaSampling = gloperate.LabelRenderPass.Sampling.Smooth1;
        this._labelPass.depthFunc = context.gl.LESS;


        this._labels = new Array(3);

        this._labels[0] = new gloperate.Position3DLabel(new gloperate.Text('dsaf asdf'), 
            gloperate.Label.Type.Static);
        this._labels[0].lineAnchor = gloperate.Label.LineAnchor.Baseline;
        this._labels[0].alignment = gloperate.Label.Alignment.Left;
        this._labels[0].position = [-0.8, 0.25, -1.0];
        this._labels[0].direction = [ 1.0, 0.0, 0.0];
        this._labels[0].up = [0.0, 1.0, 0.0];
        this._labels[0].fontSize = 0.25;
        this._labels[0].fontSizeUnit = gloperate.Label.Unit.World;
        this._labels[0].color.fromHex('#ffffff');

        this._labels[1] = new gloperate.Position3DLabel(new gloperate.Text('asdfadsf'), 
            gloperate.Label.Type.Static);
        this._labels[1].lineAnchor = gloperate.Label.LineAnchor.Baseline;
        this._labels[1].alignment = gloperate.Label.Alignment.Right;
        this._labels[1].position = [-1.0, 0.25, -0.8];
        this._labels[1].direction = [ 0.0, 0.0,-1.0];
        this._labels[1].up = [0.0, 1.0, 0.0];
        this._labels[1].fontSize = 0.25;
        this._labels[1].fontSizeUnit = gloperate.Label.Unit.World;
        this._labels[1].color.fromHex('#ffffff');

        this._labels[2] = new gloperate.Projected3DLabel(new gloperate.Text(` !"#$%&'()*+,-./0123456789:;<=>?@\n\rABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_\`\n\rabcdefghijklmnopqrstuvwxyz{|}~`), 
            gloperate.Label.Type.Dynamic);
        this._labels[2].lineAnchor = gloperate.Label.LineAnchor.Top;
        this._labels[2].alignment = gloperate.Label.Alignment.Center;
        this._labels[2].position = [+2.0, -0.0, +2.0];
        this._labels[2].fontSize = 32.0;
        // this._labels[2].lineLength = 0.005;
        // this._labels[2].wrap = true;
        this._labels[2].elide = gloperate.Label.Elide.None;
        this._labels[2].fontSizeUnit = gloperate.Label.Unit.Mixed;
        this._labels[2].color.fromHex('#ffffff');


        this._labelPass.labels = this._labels;
        this._labelPass.update();

        return true;
    }

    onUninitialize() {
        super.uninitialize();

        this._defaultFBO.uninitialize();
        this._accumulate.uninitialize();

        gl.deleteBuffer(this._pointsBuffer);
        this._pointsProgram.uninitialize();

        gl.deleteBuffer(this._linesBuffer);
        this._linesProgram.uninitialize();
        
        this._planeGeometry.uninitialize();
        this._planeProgram.uninitialize();

        this._labelPass.uninitialize();
    }


    onDiscarded() {
        this._altered.alter('canvasSize');
        this._altered.alter('clearColor');
        this._altered.alter('frameSize');
        this._altered.alter('multiFrameNumber');
    }

    onUpdate() { 
        this._navigation.update();

        return this._altered.any || this._camera.altered;       
        // return true; // continuous rendering
    }

    onPrepare() {

        if (this._altered.frameSize || this._altered.frameScale) {
            this._intermediateFBO.resize(this._frameSize[0], this._frameSize[1]);

            this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];
            this._camera.viewport = this._canvasSize;
        }

        const aspect = this._fontFace ? this._fontFace.glyphTextureExtent[0] / this._fontFace.glyphTextureExtent[1] : 1.0;
        this._zoomDstBounds = gloperate.vec4.fromValues(
            this._canvasSize[0] * (1.0 - (aspect >= 1.0 ? 0.41 : 0.205)), this._canvasSize[1] * ((aspect <= 1.0 ? 0.41 : 0.205) * this._camera.aspect),
            this._canvasSize[0] * (1.0 - 0.02), this._canvasSize[1] * (0.02 * this._camera.aspect));

        if (this._altered.clearColor) {
            this._defaultFBO.clearColor(this._clearColor);
            this._intermediateFBO.clearColor(this._clearColor);
        }

        if (this._altered.multiFrameNumber) {
            this._ndcOffsetKernel = new gloperate.AntiAliasingKernel(this._multiFrameNumber);
        }

        this._accumulate.update();

        this._altered.reset();
        this._camera.altered = false;
    }

    onFrame(frameNumber) {
        const gl = this._context.gl;

        this._intermediateFBO.bind();
        this._intermediateFBO.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);


        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = 2.0 * ndcOffset[0] / this._frameSize[0];
        ndcOffset[1] = 2.0 * ndcOffset[1] / this._frameSize[1];

        gl.enable(gl.DEPTH_TEST);

        // render points

        this._pointsProgram.bind();
        gl.uniformMatrix4fv(this._uViewProjectionPoints, gl.GL_FALSE, this._camera.viewProjection);
        gl.uniform2fv(this._uNdcOffsetPoints, ndcOffset);


        gl.bindBuffer(gl.ARRAY_BUFFER, this._pointsBuffer);

        // refer to https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer for more information

        gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE, 
            7 * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE, 
            7 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, gl.FALSE, 
            7 * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);				    
        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
        gl.enableVertexAttribArray(2);

        gl.drawArrays(gl.POINTS, 0, this._points.length / 7);
        gl.bindBuffer(gl.ARRAY_BUFFER, gloperate.Buffer.DEFAULT_BUFFER);

        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);

        this._pointsProgram.unbind();


        // render lines

        this._linesProgram.bind();
        gl.uniformMatrix4fv(this._uViewProjectionLines, gl.GL_FALSE, this._camera.viewProjection);
        gl.uniform2fv(this._uNdcOffsetLines, ndcOffset);


        gl.bindBuffer(gl.ARRAY_BUFFER, this._linesBuffer);

        // refer to https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer for more information

        gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE, 
            6 * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE, 
            6 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);

        gl.drawArrays(gl.LINES, 0, this._lines.length / 6);
        gl.bindBuffer(gl.ARRAY_BUFFER, gloperate.Buffer.DEFAULT_BUFFER);

        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);

        this._linesProgram.unbind();
        

        // render glyph atlas

        if(this._fontFace) {

            this._planeProgram.bind();
            gl.uniformMatrix4fv(this._uViewProjectionPlane, gl.GL_FALSE, this._camera.viewProjection);
            gl.uniform2fv(this._uNdcOffsetPlane, ndcOffset);

            gl.enable(gl.BLEND);
            /* Note that WebGL supports separate blend by default. */
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            /* Use the following plain blend mode when relying on premultiplied colors. */
            // gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    
            this._fontFace.glyphTexture.bind(gl.TEXTURE0);

            this._planeGeometry.bind();
            this._planeGeometry.draw();
            this._planeGeometry.unbind();

            this._fontFace.glyphTexture.unbind();

            gl.disable(gl.BLEND);
            this._planeProgram.unbind();
        }
        

        // render labels
        
        if(this._fontFace) {
            this._labels[2]._altered.alter('dynamic');
            
            this._labelPass.ndcOffset = ndcOffset;
            this._labelPass.update();

            this._labelPass.frame();
        }
                
        
        this._labelPass.unbind();

        
        gl.disable(gl.DEPTH_TEST);

        this._accumulate.frame(frameNumber);
    }

    onSwap() { 
        this._blit.framebuffer = this._accumulate.framebuffer ?
            this._accumulate.framebuffer : this._intermediateFBO;
        this._blit.frame();

        if(!this._fontFaceFBO.valid || !this._debugBlit)
        { 
            return;
        }
         
        this._blit.srcBounds = this._zoomSrcBounds;
        this._blit.dstBounds = this._zoomDstBounds;
        this._blit.framebuffer = this._fontFaceFBO;
        this._blit.frame();
        this._blit.srcBounds = this._blit.dstBounds = undefined;
    }


    // Output Configuration

    // None        = 0,  1 sample,  no derivatives
    // Smooth1     = 1,  1 sample,  requires derivatives
    // Horizontal3 = 2,  3 samples, requires derivatives
    // Vertical3   = 3,  3 samples, requires derivatives
    // Grid3x3     = 4,  9 samples, requires derivatives
    // Grid4x4     = 5, 16 samples, requires derivatives
    aaSampling(mode) {
        this._labelPass.aaSampling = Math.min(Math.max(parseInt(mode, 10), 0), 5);
        
        this._planeProgram.bind();
        gl.uniform1i(this._planeProgram.uniform('u_aaSampling'), this._labelPass.aaSampling); 
        this._planeProgram.unbind();

        this.invalidate(true);
    }

    textureFilter(mode) {
        const gl = this._context.gl;
        if(!this._fontFace) {
            return;
        }

        let filter, anisotropy = 0;
        switch(parseInt(mode, 10)) {
            case 1:
                filter = gl.NEAREST;
                break;
            case 2:
                filter = gl.LINEAR;
                break;
            case 3:
                filter = gl.LINEAR_MIPMAP_LINEAR;
                break;
            case 4:
                filter = gl.LINEAR_MIPMAP_LINEAR;
                anisotropy = 4;
                break;
            case 8:
                filter = gl.LINEAR_MIPMAP_LINEAR;
                anisotropy = 8;
                break;
            case 16:
                filter = gl.LINEAR_MIPMAP_LINEAR;
                anisotropy = 16;
                break;
            default:
                return;
        };

        if(anisotropy > 0) {
            this._fontFace.glyphTexture.filter(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
            this._fontFace.glyphTexture.maxAnisotropy(anisotropy);
        }
        else {
            this._fontFace.glyphTexture.filter(filter, filter);
        }


        this.invalidate(true);
    }

    previewText(value) {
        this._labels[0].text.text = value;
        this._labels[1].text.text = value;
        this.invalidate(true);
    }

    debugBlit(value) {
        this._debugBlit = value;
        this.invalidate(true);
    }

    compute(identifier, size, samples) {  
        // this._queue.push([ identifier, Math.min(8192, Math.max(8, size)), samples, this._debug ]);
        // this.invalidate();
    }
  
    async changeFont(descriptionUrl, distanceFieldUrl) {

        const gl2facade = this._context.gl2facade;

        return await gloperate.FontFace.fromFiles(descriptionUrl, new Map([[ 0, distanceFieldUrl ]]), context)
            .then((fontFace) => {

                this._fontFace = fontFace;

                if(this._fontFaceFBO.initialized) {
                    this._fontFaceFBO.uninitialize();
                }
                this._fontFaceFBO.initialize([
                    [gl2facade.COLOR_ATTACHMENT0, fontFace.glyphTexture]]);

                for (var label of this._labelPass.labels) {
                    label.fontFace = fontFace;
                }
                this._labelPass.update();
                this.invalidate(true);

                return fontFace.glyphTextureExtent;
            })
            .catch((reason) => gloperate.auxiliaries.log(
                gloperate.auxiliaries.LogLevel.Error, reason));
    }

}

