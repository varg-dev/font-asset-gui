
class Renderer extends gloperate.Renderer {

    _camera;                // : gloperate.Camera
    _navigation;            // : gloperate.Navigation

    _depthRenderbuffer;     // : gloperate.Renderbuffer
    _colorRenderTexture;    // : gloperate.Texture2D
    _intermediateFBO;       // : gloperate.Framebuffer
    _fontFaceFBO;           // : gloperate.Framebuffer

    _ndcFillingTriangle;    // : gloperate.NdcFillingTriangle
    _ndcOffsetKernel;       // : gloperate.AntiAliasingKernel

    _program;               // : gloperate.Program

    _defaultFBO;            // : gloperate.DefaultFramebuffer

    _accumulate;            // : gloperate.AccumulatePass
    _blit;                  // : gloperate.BlitPass

    _labelPass;		        // : gloperate.LabelRenderPass;
    _labels;		        // : Array of gloperate:Labels
    
    _fontFace = null;       // : gloperate.FontFace;


    _zoomSrcBounds;         // : vec4;
    _zoomDstBounds;         // : vec4;


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

        // this._uViewProjection = this._program.uniform('u_viewProjection');
        // this._uNdcOffset = this._program.uniform('u_ndcOffset');


        // this._texture = new Texture2D(context, 'Texture');
        // this._texture.initialize(1, 1, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE);
        // this._texture.wrap(gl.REPEAT, gl.REPEAT);
        // this._texture.filter(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        // this._texture.maxAnisotropy(Texture2D.MAX_ANISOTROPY);

        // this._texture.fetch('/examples/data/blue-painted-planks-diff-1k-modified.webp').then(() => {
        //     const gl = context.gl;

        //     this._program.bind();
        //     gl.uniform1i(this._program.uniform('u_textured'), true);

        //     this.finishLoading();
        //     this.invalidate(true);
        // });

        this._camera = new gloperate.Camera();
        this._camera.center = gloperate.vec3.fromValues(0.0, 0.0, 0.0);
        this._camera.up = gloperate.vec3.fromValues(0.0, 1.0, 0.0);
        this._camera.eye = gloperate.vec3.fromValues(1.0, 0.0, 3.0);
        this._camera.near = 1.0;
        this._camera.far = 16.0;

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


        this._labelPass = new gloperate.LabelRenderPass(context);
        this._labelPass.initialize();
        this._labelPass.camera = this._camera;
        this._labelPass.target = this._intermediateFBO;
        this._labelPass.depthMask = true;
        this._labelPass.aaStepScale = 0.5;
        this._labelPass.aaSampling = gloperate.LabelRenderPass.Sampling.Grid4x4;
        this._labelPass.depthFunc = context.gl.LESS;

        this._labels = new Array(2);

        this._labels[0] = new gloperate.Position3DLabel(new gloperate.Text('FontFace'), 
            gloperate.Label.Type.Static);
        this._labels[0].lineAnchor = gloperate.Label.LineAnchor.Center;
        this._labels[0].alignment = gloperate.Label.Alignment.Center;
        this._labels[0].position = [0.0,-0.25, 0.0];
        this._labels[0].direction = [0.0, 0.0,-1.0];
        this._labels[0].up = [0.0, 1.0, 0.0];
        this._labels[0].fontSize = 0.3;
        this._labels[0].fontSizeUnit = gloperate.Label.Unit.World;
        this._labels[0].color.fromHex('#ffffff');

        this._labels[1] = new gloperate.Position3DLabel(new gloperate.Text('FontFace'), 
            gloperate.Label.Type.Static);
        this._labels[1].lineAnchor = gloperate.Label.LineAnchor.Center;
        this._labels[1].alignment = gloperate.Label.Alignment.Center;
        this._labels[1].position = [0.0, 0.25, 0.0];
        this._labels[1].direction = [-1.0, 0.0, 0.0];
        this._labels[1].up = [0.0, -1.0, 0.0];
        this._labels[1].fontSize = 0.3;
        this._labels[1].fontSizeUnit = gloperate.Label.Unit.World;
        this._labels[1].color.fromHex('#ffffff');

        this._labelPass.labels = this._labels;

        return true;
    }

    onUninitialize() {
        super.uninitialize();

        this._cuboid.uninitialize();
        this._program.uninitialize();

        this._defaultFBO.uninitialize();
        this._accumulate.uninitialize();

        
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

        if (this._altered.canvasSize) {
            this._zoomDstBounds = gloperate.vec4.fromValues(
                this._canvasSize[0] * (1.0 - 0.374), this._canvasSize[1] * (1.0 - 0.374 * this._camera.aspect),
                this._canvasSize[0] * (1.0 - 0.032), this._canvasSize[1] * (1.0 - 0.032 * this._camera.aspect));
        }

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

        if(this._fontFace) {
            this._labelPass.ndcOffset = ndcOffset;
            this._labelPass.update();
            this._labelPass.frame();
            this._labelPass.unbind();
        }

        gl.disable(gl.DEPTH_TEST);

        this._accumulate.frame(frameNumber);
    }

    onSwap() { 
        this._blit.framebuffer = this._accumulate.framebuffer ?
            this._accumulate.framebuffer : this._intermediateFBO;
        this._blit.frame();

        if(!this._fontFaceFBO.valid)
        { 
            return;
        }
         
        this._blit.srcBounds = this._zoomSrcBounds;
        this._blit.dstBounds = this._zoomDstBounds;
        this._blit.framebuffer = this._fontFaceFBO;
        this._blit.frame();
        this._blit.srcBounds = this._blit.dstBounds = undefined;
    }

    compute(identifier, size, samples) {  
        // this._queue.push([ identifier, Math.min(8192, Math.max(8, size)), samples, this._debug ]);
        // this.invalidate();
    }

    text(value) {
        for (var label of this._labelPass.labels) {
            label.text.text = value;
            label._altered.alter('dynamic');
        }
        this.invalidate(true);
    }

    change(file) {

        const gl2facade = this._context.gl2facade;

        gloperate.FontFace.fromFile(file, context)
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
            })
            .catch((reason) => gloperate.auxiliaries.log(
                gloperate.auxiliaries.LogLevel.Error, reason));



        // var fr = new FileReader();
        // fr.onload = () => {
        //     // this._fontTexture.load(fr.result).then(() => {
        //     //     const gl = this._context.gl;

        //     //     this._fontTexture.bind(gl.TEXTURE0);
        //     //     this._fontTexture.wrap(gl.REPEAT, gl.REPEAT, false, false);
        //     //     this._fontTexture.filter(gl.LINEAR, gl.LINEAR, false, false); 

        //     //     this._debug = false;

        //     //     callback();
        //     // });
        // };
        // fr.readAsDataURL(file);
    }

}


// Renderer.prototype.SHADER_SOURCE_VERT = `
// precision highp float;
// precision highp int;

// #if __VERSION__ == 100
//     attribute vec2 a_vertex;
// #else
//     in vec2 a_vertex;
//     #define varying out
// #endif

// uniform vec2 u_ndcOffset;

// varying vec2 v_uv;

// void main(void)
// {
//     vec2 v = a_vertex;
//     v_uv = a_vertex;
    
//     gl_Position = vec4(a_vertex.xy + u_ndcOffset, 0.0, 1.0);
// }
// `;


// Renderer.prototype.SHADER_SOURCE_FRAG = `
// precision highp float;
// precision highp int;

// #if __VERSION__ == 100
//     #define fragColor gl_FragColor
//     #define texture texture2D
// #else
//     layout(location = 0) out vec4 fragColor;
//     #define varying in
// #endif

// uniform sampler2D u_font;

// varying vec2 v_uv;

// void main(void)
// {
//     fragColor = texture(u_font, v_uv);
// }
// `;

